# 05 · Migración de CallRoom + useWebRTC a Presence + Broadcast

> **Estado:** En curso · **Predecesor:** [04 · Dashboard](04-dashboard-migration.md) · **Sucesor:** [06 · Profile](06-profile-migration.md)

---

## Objetivo

Reescribir `CallRoom.tsx` y `useWebRTC.ts` para que:

- **Participantes** vivan en **Realtime Presence** (no en una subcolección de DB).
- **Señalización WebRTC** vaya por **Realtime Broadcast** (no por escrituras a DB).
- **Mood y mute** sean parte del payload de Presence (ya no se actualizan vía DB).
- **Heartbeat de actividad** llame a la RPC `touch_call(callId)` cada 60 s.
- **Cierre de llamada** por el creador siga siendo un `UPDATE` normal sobre `calls`.

Este es el paso donde se materializa el ahorro estructural: una llamada activa de 5 personas pasa de **decenas de escrituras DB por minuto** a **una sola** (`touch_call` cada 60 s).

---

## Decisiones

### 1. Un canal único por llamada

`supabase.channel('call:{callId}', { config: { presence: { key: userId } } })` lleva las tres dimensiones:

- **Presence** (`channel.track({...})`): quién está, cuándo entró, mood, isMuted.
- **Broadcast** (`channel.send({ event: 'signal', payload: {...} })`): offers, answers, ICE candidates.
- **Postgres CDC** (`channel.on('postgres_changes', { filter: id=eq.{callId} })`): detectar cuando el creador hace `status='ended'`.

Un solo canal abierto por participante por llamada. Cuando sale, el canal se cierra y Presence elimina su entrada automáticamente (`untrack()` + `removeChannel()`).

### 2. CallRoom es el dueño del canal; useWebRTC lo recibe

`useWebRTC(callId, userId, channel)` no crea su propio canal — recibe el del CallRoom. Eso evita duplicar conexiones y mantiene un solo punto de verdad sobre el lifecycle.

```ts
// CallRoom.tsx
const channel = useCallChannel(callId, userProfile);
const { localStream, remoteStreams, initiateCall } = useWebRTC(callId, userProfile.uid, channel);
```

Si decidiéramos extraer presencia a un hook (`useCallChannel`), también podríamos — por ahora lo dejo inline en CallRoom para no proliferar archivos.

### 3. Evitar "glare" de offers en mesh

En mesh WebRTC, cuando dos peers se ven simultáneamente por Presence, ambos podrían intentar mandar offer al otro → collision. Regla simple para deduplicar: **solo el peer con UID lexicográficamente mayor inicia la oferta**. El otro espera la oferta entrante.

```ts
if (peerUid !== myUid && !knownPeers.has(peerUid)) {
  knownPeers.add(peerUid);
  if (myUid > peerUid) initiateCall(peerUid);
}
```

### 4. Filtro de broadcast en el cliente

Supabase Broadcast envía a **todos** los suscriptores del canal — no hay filtros server-side por destinatario. Cada peer descarta los mensajes cuyo `payload.to !== myUid`. Trade-off aceptado: los ICE candidates son pequeños (≪1 KB), el filtrado es O(1) en cliente.

### 5. Mood / mute → `channel.track({...})`

Cuando el usuario cambia mood o mute, se vuelve a llamar `channel.track({...})` con el payload completo. Presence reemplaza el estado anterior. Cero impacto en DB. Lo importante: incluir todos los campos cada vez (Presence track reemplaza, no merge), incluyendo `joinedAt` que se preserva en una `ref`.

### 6. Heartbeat: RPC `touch_call` cada 60 s

```ts
useEffect(() => {
  if (!callId) return;
  const tick = () => supabase.rpc('touch_call', { p_call_id: callId });
  tick();
  const id = setInterval(tick, 60_000);
  return () => clearInterval(id);
}, [callId]);
```

Cada cliente activo en la llamada llama `touch_call` cada minuto. Eso mantiene `last_active_at` fresco y la llamada aparece en "En Vivo" del Dashboard. Cuando todos cierren, el último `touch_call` quedó hace ≤60 s; en cuestión de 5 min sale del listado.

### 7. Cierre voluntario

- **Salir solo** (cualquiera): se sale, Presence elimina automáticamente la entrada. La llamada sigue activa si quedan otros.
- **Terminar para todos** (solo creador, validado por RLS): `supabase.from('calls').update({ status: 'ended', ended_at: now }).eq('id', callId)`. La suscripción Realtime de los demás participantes detecta `status='ended'` y dispara `onLeave()` automáticamente en sus clientes.

---

## API del hook `useWebRTC`

```ts
useWebRTC(
  callId: string | null,
  userId: string | null,
  channel: RealtimeChannel | null,
  peerUidsKey: string          // uids ordenados y unidos por coma
): {
  localStream: MediaStream | null;
  remoteStreams: { [uid: string]: MediaStream };
  initiateCall: (targetUid: string) => Promise<void>;
  localScreenStream: MediaStream | null;
  remoteScreenStreams: { [uid: string]: MediaStream };
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}
```

Internamente:

- `localStream` — `getUserMedia({ audio: true })` una vez al montar.
- Para cada peer, `RTCPeerConnection` con `pc.onicecandidate` → `channel.send({event:'signal',...})`.
- `ontrack` discrimina por `kind`: audio → `remoteStreams`, video → `remoteScreenStreams` (envuelto en `new MediaStream([track])` para consistencia cross-browser).
- `peerUidsKey`: cuando un uid desaparece de la clave, su `RTCPeerConnection` se cierra y sus streams se limpian.

---

## Screen Sharing (añadido)

### Mecanismo `addTrack` + renegociación manual

No se usan transceivers placeholder — la pista de video se añade on-demand:

```
Usuario pulsa "Compartir"
  → getDisplayMedia({ video: true })
  → para cada pc: pc.addTrack(videoTrack, stream)
  → renegotiate(peerUid, pc): createOffer → setLocalDescription → send offer broadcast
  → peer remoto: ontrack (kind=video) → remoteScreenStreams[uid] = new MediaStream([track])
  → hero layout activa en ambos lados
```

Al detener:
```
pc.removeTrack(sender) → renegotiate → SDP actualizado
stream.getTracks().forEach(t => t.stop())
setLocalScreenStream(null) → Effect 5c broadcastea isSharingScreen: false
```

**Glare protection (lite):** si `pc.signalingState !== 'stable'` al renegociar, se omite el ciclo (otra oferta está en vuelo). Suficiente para el caso de uso P2P.

**`track.onended` listener:** detecta el botón nativo "Detener uso compartido" del navegador → llama `stopScreenShare()` automáticamente.

### Estado de screen share por peer

`isSharingScreen` viaja en el payload de `peer-state` broadcast (igual que `isMuted` y `mood`). El effect 5c en `CallRoom` lo broadcastea de forma reactiva cuando `localScreenStream` cambia:

```ts
useEffect(() => {
  const newValue = !!localScreenStream;
  if (sharingScreenRef.current === newValue) return; // anti-loop
  sharingScreenRef.current = newValue;
  channel.send({ event: 'peer-state', payload: { ..., isSharingScreen: newValue } });
}, [localScreenStream]);
```

---

## Hero Layout

Cuando `activeSharer !== null` (alguien comparte pantalla), el layout de la llamada cambia:

```
┌─────────────────────────────────┐ ┌──────────────────┐
│                                 │ │  Participante 1  │
│        HeroScreen               │ │  Participante 2  │
│   <video> a pantalla completa   │ │  Participante 3  │
│   + overlay: avatar + nombre    │ │  ────────────    │
│                                 │ │  [Mic] [Share]   │
└─────────────────────────────────┘ │  [Moods]         │
           ~75%                     └──────────────────┘
                                          ~25%
```

- **`activeSharer`**: `useMemo` — devuelve `userProfile.uid` si `localScreenStream` está activo, o el uid del primer peer con `isSharingScreen: true`, o `null`.
- **`HeroScreen`**: componente inline con `<video>` + overlay de nombre/avatar del presentador. Muestra placeholder "Cargando pantalla…" si el stream aún no llegó.
- **`ParticipantCard compact`**: layout horizontal (avatar 40px, sin slider de volumen, sin video duplicado). El audio sigue activo vía `<audio>` oculto.
- **Controles en sidebar**: mic + screen share + moods se mueven debajo de la lista de participantes (anclados al fondo con `flex-shrink-0`). La lista scrollea independientemente (`flex-1 overflow-y-auto min-h-0`).
- **Footer**: se oculta en desktop (`md:hidden`) cuando hay hero activo. En móvil permanece visible.
- **Responsive**: en móvil el hero se apila verticalmente sobre un strip horizontal de participantes.

---

## Sistema de Solicitud de Screen Share

Solo puede haber un presentador activo a la vez. Si alguien intenta compartir mientras otro lo está haciendo:

```
Usuario B pulsa "Solicitar"
  → broadcast: screen-share-request { fromUid, fromName }
  → Usuario A (presentador): popup "B quiere compartir pantalla" + barra 15s
  → A acepta:
      stopScreenShare() → broadcast: screen-share-response { toUid: B, accepted: true }
      B recibe → setPendingAutoStart(true)
      Effect: pendingAutoStart && !activeSharer → startScreenShare()
  → A deniega / timeout:
      broadcast: screen-share-response { toUid: B, accepted: false }
      B recibe → toast "Solicitud denegada"
```

**Decisiones de diseño:**

| Decisión | Razón |
|---|---|
| `pendingAutoStart` en vez de `setTimeout(500ms)` | Reactivo: espera a que `activeSharer === null` (el stream anterior se liberó), sin asumir latencia de red |
| Busy guard: segunda solicitud → `accepted: false` inmediato | Evita que una nueva solicitud pise a la primera en el popup del presentador |
| Presentador para naturalmente → `outgoingShareRequest` se limpia, NO auto-start | El solicitante debe decidir conscientemente volver a presionar "Compartir" |
| `incomingShareRequestRef` mirror del state | Los handlers de broadcast capturan el ref fresco en closures; el state no es legible fresco dentro de un handler registrado una sola vez |

---

## Verificación

1. **Audio básico**: dos peers, llamada 1-a-1. Audio funcional, mute y mood se reflejan en < 1 s.
2. **Screen share básico**: A comparte. B ve el hero layout con el video de A. A para; layout vuelve a grid.
3. **Peer entra mid-share**: A comparte, C entra. C ve el hero desde el primer momento (track añadido al crear la PC si `screenStreamRef.current` está activo).
4. **Botón nativo**: A usa "Detener uso compartido" del navegador. `track.onended` dispara `stopScreenShare()`, hero desaparece en todos los peers.
5. **Solicitud — aceptar**: A comparte, B solicita. A acepta. A deja de compartir, B empieza.
6. **Solicitud — denegar / timeout**: B ve toast "Solicitud denegada".
7. **Busy**: A comparte, B y C solicitan simultáneamente. Solo B llega al popup de A; C recibe denegación inmediata.
8. **Presentador sale**: A comparte, B solicitó. A cierra pestaña. `activeSharer` → null, `outgoingShareRequest` se limpia (Effect 9b). B puede presionar "Compartir" manualmente.
9. **Scroll sidebar**: 8+ participantes en llamada hero. Lista scrollea, controles permanecen fijos al fondo.
10. **TypeScript**: `npx tsc --noEmit` limpio.

---

## Resultado final

- ✅ `src/hooks/useWebRTC.ts`: screen share con `addTrack`/`removeTrack` + renegociación manual. `ontrack` discriminado por `kind`. `peerUidsKey` para cleanup reactivo de peers desaparecidos.
- ✅ `src/components/CallRoom.tsx`: hero layout automático, `ParticipantCard` con modo `compact`, componente `HeroScreen`, sistema de solicitud con `pendingAutoStart` reactivo, controles anclados al fondo de sidebar.
- ✅ `src/types.ts`: `Participant.isSharingScreen` añadido.
- ✅ Todos los cambios pasan `tsc --noEmit` sin errores.
