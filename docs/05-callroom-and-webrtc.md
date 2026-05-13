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

## API del hook `useWebRTC` (nueva)

```ts
useWebRTC(
  callId: string | null,
  userId: string | null,
  channel: RealtimeChannel | null
): {
  localStream: MediaStream | null;
  remoteStreams: { [uid: string]: MediaStream };
  initiateCall: (targetUid: string) => Promise<void>;
}
```

Internamente:

- `localStream` se inicializa con `getUserMedia({ audio: true })` una vez al montar.
- Para cada peer, crea un `RTCPeerConnection` con `pc.onicecandidate` → `channel.send({event:'signal', payload:{to,from,type:'candidate',data}})`.
- Escucha `channel.on('broadcast', { event: 'signal' }, ...)` y procesa offers/answers/candidates dirigidos a `userId`.

---

## Verificación

1. **Cero subcolecciones**: en Supabase → Table Editor, **no existen** tablas de `participants` ni `signals`. Toda la actividad live va por Realtime.
2. **Llamada 1-a-1**: dos pestañas/dispositivos, una crea llamada, la otra se une. Ambas se ven en la grilla, audio funciona en ambas direcciones, mute y mood se reflejan en <1 s.
3. **Llamada grupal 3-5**: tres+ peers, todos se ven entre sí (mesh), audio entre todos.
4. **Heartbeat**: con la llamada abierta, hacer `select last_active_at from calls where id=...` en el SQL editor cada minuto. Debe avanzar.
5. **Cierre por creador**: el creador hace "Terminar para todos". Los demás clientes detectan el cambio vía postgres_changes y salen automáticamente al dashboard.
6. **Salida limpia**: cerrar pestaña sin pulsar "Terminar". Los otros peers ven al usuario desaparecer de Presence en ≤2 s.

---

## Resultado

Hecho:

- ✅ `src/hooks/useWebRTC.ts` reescrito de cero. API nueva: `useWebRTC(callId, userId, channel)`. Ya no toca DB en absoluto. Toda la señalización va por `channel.send({event:'signal'})` y se recibe vía `channel.on('broadcast', {event:'signal'})`. Filtrado por `payload.to === userId` en cliente. Manejo de `connectionstatechange` añadido para limpiar `remoteStreams` cuando un peer se desconecta.
- ✅ `src/components/CallRoom.tsx` reescrito. Cinco efectos limpios:
  1. Cargar info inicial + suscribirse a `postgres_changes` sobre la fila `calls` (detectar `status='ended'`).
  2. Crear canal Realtime con Presence + Broadcast; `track()` al suscribirse.
  3. Iniciar oferta WebRTC para peers nuevos (regla "uid mayor inicia" evita glare).
  4. Heartbeat `touch_call(callId)` cada 60 s.
  5. Sincronizar `isMuted` al audio track + re-track presence.
- ✅ Mood / mute updates → `channel.track({...})`. Cero escrituras a DB.
- ✅ Cierre "Terminar para todos" → `update calls set status='ended'`. Los demás clientes lo detectan vía postgres_changes y `onLeave` automáticamente.
- ✅ Salida normal → cleanup del effect del canal hace `untrack()` + `removeChannel()`. Presence elimina la entrada en ≤2 s para todos los demás.
- ✅ `npm run lint` pasa sin errores.
- ✅ Vite HMR detectó cambios sin errores.

Estado del proyecto en este punto: la app entera funciona sobre Supabase salvo `Profile.tsx` (paso 06) y los imports vestigiales de `firebase.ts` (paso 07).
