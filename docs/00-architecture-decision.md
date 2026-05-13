# 00 · Decisión de arquitectura: Firebase → Supabase

> **Estado:** Decidido el 2026-05-12 · **Acción:** Migrar backend de Firebase (Auth + Firestore) a Supabase (Auth + Postgres + Realtime).

---

## Objetivo

Elegir el backend con el que se va a construir esta app de llamadas tipo Discord, optimizando para:

1. **Costo mínimo** (proyecto de portafolio, tier gratuito).
2. **Mínima superficie de error** (sin servidores propios, sin operaciones que escalen mal).
3. **Encaje natural con el patrón de uso**: presencia en tiempo real + señalización WebRTC + chat persistente.

---

## Contexto

La app se inició en Google AI Studio sobre **Firebase Auth + Firestore puro** (sin Cloud Functions). El alcance funcional decidido con el usuario:

- **Llamadas grupales 3–10 personas** mediante mesh WebRTC.
- **Datos persistentes**: chat de texto + lista de amigos / DMs (sin estructura completa de servers/canales tipo Discord).
- **Tolera pausa**: aceptable que el proyecto se "duerma" si está inactivo y tarde un poco al despertar.

### Problema observado

Antes de esta migración, una versión previa consumió **toda la cuota diaria de escritura de Firestore en segundos**. El parche (commit `56e1a7a`) corrigió un `useEffect` que re-suscribía un listener en bucle, pero la pregunta de fondo seguía abierta: **¿es Firestore la herramienta correcta para esta app?**

Diagnóstico de los puntos calientes:

1. **Señalización WebRTC sobre Firestore** (`useWebRTC.ts`): cada ICE candidate era un `addDoc`. En una llamada mesh de 5 personas se generan 50–200 candidates por minuto de conexión. Cada uno cuenta como una escritura en Firestore (cuota Spark: 20 000 writes/día).
2. **Listener de participantes** (`CallRoom.tsx`): cada cambio de `mood` / `isMuted` escribía a un documento y leía desde cada peer.
3. **Auto-cleanup desde el cliente** (`Dashboard.tsx`): cualquier bug de dependencias re-suscribe el listener — exactamente el patrón del bucle infinito.

> **Raíz del problema:** Firestore es un store transaccional caro por operación, y aquí se estaba usando como **bus de eventos efímeros** (presencia, señalización). Es el caso de uso para el que Firestore es **menos** competitivo.

---

## Opciones evaluadas

| Aspecto | Firebase actual (Firestore puro) | Firebase mixto (RTDB señalización + Firestore datos) | **Supabase (Postgres + Realtime)** | MongoDB Atlas |
|---|---|---|---|---|
| Costo de señalización WebRTC | Caro (1 write por ICE) | Barato (RTDB cobra por GB, no por op) | **Gratis: Broadcast no toca DB** | Necesita backend propio (Socket.io) |
| Presencia (online/offline) | Manual y cara | Nativo (`onDisconnect`) | **Nativo (Realtime Presence)** | Manual + backend |
| Chat persistente + DMs | OK pero caro a escala | OK | **Postgres + RLS, muy natural** | OK, pero sin realtime nativo cliente |
| Auth Google + email/pass | ✅ | ✅ | ✅ (paridad funcional) | Hay que construirla o usar Auth0 |
| Backend propio requerido | No | No | No | **Sí (deal-breaker)** |
| Pausa por inactividad | No | No | Sí, 7 días (tolerable) | No |
| Trabajo de migración | 0 | Medio | Alto | Muy alto |
| Valor en portafolio | Bajo (ya hecho) | Medio | **Alto (Postgres + RLS + Realtime)** | Bajo para este caso |

**MongoDB** quedó descartado: sin realtime nativo de cliente, obliga a montar un servidor Node + Socket.io → más costo operativo, más superficie de error.

---

## Decisión: Supabase

Se elige **Supabase** por una razón estructural: separa los **canales efímeros** (Broadcast y Presence, que **no escriben a la base de datos** y no se facturan por operación) de las **suscripciones a Postgres** (para datos que sí queremos persistir, con replicación lógica vía CDC).

Esto **ataca la raíz** del problema, no lo desplaza:

| Hoy (Firestore) | Mañana (Supabase) | Costo |
|---|---|---|
| `users/{uid}` | tabla `profiles` + RLS por `auth.uid()` | bajo (1 write al registrar; updates esporádicos) |
| `calls/{callId}` | tabla `calls` | bajo (1 write al crear, 1 al cerrar) |
| `calls/{callId}/participants/{uid}` | **Realtime Presence channel `call:{callId}`** | **0** (no toca DB) |
| `calls/{callId}/signals/{id}` (offers/answers/ICE) | **Realtime Broadcast en el mismo channel** | **0** (no toca DB) |
| `mood` / `isMuted` (volátiles) | parte del payload de Presence | **0** |
| Chat de texto (futuro) | tabla `messages` + Realtime subscription | bajo |
| Amigos / DMs (futuro) | tablas `friendships`, `dm_threads`, `dm_messages` + RLS | bajo |

### Por qué no Plan B (Firebase + RTDB)

Es válido técnicamente y requiere menos trabajo, pero:

- Sigue acoplando el stack a un único proveedor con historial de quemar cuota.
- No aporta a portafolio: ya se demostró Firebase, no se aprende nada nuevo.
- Postgres + RLS es un activo de portafolio mucho más fuerte y reutilizable.

---

## Trade-offs aceptados

- **Cold start tras 7 días de inactividad** en el plan free de Supabase. Aceptado: el usuario lo aprobó explícitamente y se documentará en `docs/08-verification.md`.
- **Mayor trabajo de migración** (auth + datos + señalización + presencia). Se compensa con la disciplina de documentar paso a paso en `docs/`.
- **Curva de aprendizaje de RLS**. Es exactamente lo que se quiere mostrar en el portafolio.

---

## Próximos pasos

Ver el plan completo en `docs/` (archivos 01–08). El siguiente paso es:

→ [01 · Bootstrap de Supabase](01-supabase-bootstrap.md)
