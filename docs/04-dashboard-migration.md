# 04 · Migración de Dashboard a Supabase

> **Estado:** En curso · **Predecesor:** [03 · Auth](03-auth-migration.md) · **Sucesor:** [05 · CallRoom + WebRTC](05-callroom-and-webrtc.md)

---

## Objetivo

Reemplazar todo el acceso a Firestore en `Dashboard.tsx` por queries y suscripciones Realtime a Postgres. Al final del paso, listar llamadas, ver actualizaciones en tiempo real cuando se crean/cierran y crear una llamada nueva funciona enteramente sobre Supabase.

`CallRoom.tsx` y `useWebRTC.ts` quedan intactos en este paso — se migran en bloque en el paso 05 porque comparten el canal Realtime (Presence + Broadcast).

---

## Decisiones

### 1. Auto-cleanup de llamadas abandonadas

Antes (Firestore): el cliente que listaba `calls` también escribía `status='ended'` en cualquier llamada con `last_active_at > 5 min`. Eso era el origen del bucle infinito del commit `56e1a7a` y un patrón anti-escalable (cualquier cliente abierto recalculaba y escribía).

Ahora: **el cliente no escribe nunca para hacer cleanup.** En su lugar:

- En el paso 05, mientras un participante está en una llamada, llama a la RPC `touch_call(callId)` cada 60 s (heartbeat). Eso actualiza `last_active_at` server-side.
- En el Dashboard, las "activas" se filtran por `status='active' AND last_active_at > now() - 5 min`.
- Las llamadas con `status='active'` pero `last_active_at` viejo **simplemente no aparecen** — ni en activas ni en historial. Quedan "huérfanas" en DB pero invisibles. Aceptable para portafolio. Si en el futuro se quiere limpieza real, se agrega un `pg_cron` server-side (no requiere cliente).

Esto elimina por completo las escrituras de auto-cleanup desde el cliente.

### 2. Filtrado en la query, no en el cliente

```ts
supabase.from('calls')
  .select('*')
  .eq('status', 'active')
  .gte('last_active_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false });
```

Postgres hace el filtro; el cliente recibe solo lo que necesita. Eficiente y consistente.

### 3. Suscripción Realtime sobre `calls`

La tabla `calls` está incluida en la publication `supabase_realtime` (paso 02). Se suscribe a `postgres_changes` con `event: '*'` para reaccionar a INSERT (nueva llamada → aparece), UPDATE (cambio de status → mueve a historial) y DELETE (cleanup futuro).

Estrategia simple: **refetch completo** en cualquier evento. Es barato porque la query devuelve pocas filas (solo las activas recientes y 5 históricas). No vale la pena hacer reconciliación incremental.

### 4. Crear llamada: insert + redirección

```ts
const { data, error } = await supabase
  .from('calls')
  .insert({ name, creator_id: user.id })
  .select()
  .single();
if (data) onJoinCall(data.id);
```

`status`, `created_at`, `last_active_at` los rellena el default de la tabla.

### 5. Mapeo snake_case → camelCase

Postgres usa snake_case (`creator_id`, `last_active_at`); el resto del código usa el tipo `Call` con camelCase. Helper local `rowToCall(row)` hace el mapeo, sin tocar `src/types.ts`.

---

## Cambios concretos en `Dashboard.tsx`

| Antes (Firestore) | Después (Supabase) |
|---|---|
| `import { db, auth } from '../firebase'` | `import { supabase } from '../supabase'` |
| `onSnapshot(collection(db, 'calls'), ...)` | `supabase.channel('calls-list').on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refetch).subscribe()` |
| `updateDoc(doc(db, 'calls', id), { status: 'ended' })` desde el cliente | **Eliminado**. Cleanup ocurre vía filtro de query. |
| `addDoc(collection(db, 'calls'), {...})` | `supabase.from('calls').insert({...}).select().single()` |
| `handleFirestoreError` | `console.error` simple (la lib de errores se borra en paso 07) |

---

## Verificación

1. `npm run dev` y abrir el dashboard.
2. **Listar activas**: tras login, la sección "En Vivo" debe estar vacía (porque ninguna llamada ha tenido heartbeat reciente — CallRoom todavía es Firebase).
3. **Crear llamada**: escribir un nombre y dar "Crear Llamada". En el dashboard de Supabase → Table Editor → `calls` debe aparecer la fila con `status='active'`, `last_active_at` ≈ now. La UI redirige a CallRoom (que será inestable hasta el paso 05 — esperado).
4. **Realtime**: abrir el dashboard en dos pestañas. En la pestaña A crear una llamada → debe aparecer en la pestaña B sin recargar (en activas, asumiendo que el `created_at` está dentro de la ventana de 5 min).
5. **Cero escrituras de cleanup**: en Supabase → Project → API Logs (o Realtime → Inspector), durante 10 minutos con el dashboard abierto y sin crear nada, **no** debe haber escrituras a `calls`. Era el problema original.

---

## Resultado

Hecho:

- ✅ `src/components/Dashboard.tsx` reescrito sobre Supabase. Eliminados imports de `firebase/firestore`, `firebase`, `firestore-errors`.
- ✅ Listado de activas con filtro server-side: `status='active' AND last_active_at >= now() - 5 min`.
- ✅ Listado de historial: `status='ended'` limit 5.
- ✅ Suscripción Realtime a `calls` con event `*` → cualquier cambio dispara `refetch()` (estrategia simple, barata porque la query devuelve pocas filas).
- ✅ Eliminado completamente el código de auto-cleanup desde el cliente (causa raíz del bucle infinito del commit `56e1a7a`).
- ✅ Crear llamada con `insert({ name, creator_id }).select().single()`; los demás campos vienen de defaults SQL.
- ✅ Helper `rowToCall` inline para mapear snake_case → camelCase.
- ✅ `npm run lint` pasa sin errores.

Cero escrituras a `calls` desde el cliente fuera de:
- INSERT al crear una llamada (1 escritura).
- UPDATE `{status:'ended'}` al cerrar manualmente (vía CallRoom, paso 05) — 1 escritura.
- RPC `touch_call` heartbeat cada 60s (paso 05) — 1 escritura por minuto y por llamada activa.

Comparado con el modelo Firestore previo (decenas de escrituras por minuto por cliente), esto es una reducción de **2-3 órdenes de magnitud**.
