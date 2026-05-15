# KallIt — Made by Jada

> App de llamadas grupales inspirada en Discord. Construida sobre **React 19 + TypeScript + Vite**, con **Supabase** (Auth + Postgres + Realtime) como backend y **WebRTC en mesh** para audio y screen sharing peer-to-peer.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4, Motion (animaciones), Lucide (iconos), Montserrat (tipografía de marca) |
| Backend | **Supabase** — Auth (email/password + Google OAuth), Postgres + Row Level Security, Realtime (Broadcast + Presence + CDC) |
| Tiempo real | WebRTC mesh para audio + screen share · Supabase Realtime para señalización, presencia y chat |
| Avatares | DiceBear (avataaars) |
| Deploy | GitHub Pages (build estático) |

---

## Features

### Llamadas grupales
- **Audio P2P en mesh** vía WebRTC — sin servidor de medios, sin costos de relay
- **Screen sharing** con layout hero automático: el video toma el área principal, los participantes se mueven a una sidebar compacta
- **Un presentador a la vez** — si alguien está compartiendo, los demás envían una solicitud; el presentador acepta o deniega con popup de 15 s
- **Chat en llamada** — mensajes persistidos en Supabase, panel lateral deslizable
- **Moods** — expresa tu estado con emojis en tiempo real (broadcast, sin DB)
- **Control de volumen por participante** — slider individual + silencio local
- Llamadas **públicas** (cualquiera se une) o **privadas** (solo con link de invitación)

### Social
- **Sistema de amigos** — buscar usuarios, enviar/aceptar/rechazar solicitudes; aceptación mutua instantánea
- **Mensajes directos (DM)** — conversaciones 1-a-1 persistentes con badge de no leídos

### Personalización
- **4 temas de color** (Default, Ocean, Sunset, Forest) + **Dark mode**
- **Avatar personalizable** (piel, ropa, ojos, boca) con previsualización en tiempo real
- **Notificaciones de escritorio** (con permiso del navegador)

---

## Arquitectura de una llamada

```
┌─────────────────┐                                 ┌─────────────────┐
│   Cliente A     │     Supabase Realtime           │   Cliente B     │
│   (browser)     │     channel "call:{id}"         │   (browser)     │
│                 │ ─── presence ────────────────►  │                 │
│   ┌───────────┐ │ ─── broadcast(signal: offer)─►  │ ┌─────────────┐ │
│   │ useWebRTC │ │ ◄── broadcast(signal: answer)── │ │  useWebRTC  │ │
│   └─────┬─────┘ │ ─── broadcast(signal: ICE)───►  │ └──────┬──────┘ │
│         │       │ ─── broadcast(peer-state) ───►  │        │        │
│         │       │ ─── broadcast(screen-share-*)►  │        │        │
│         └───────┴────── WebRTC P2P ───────────────┴────────┘        │
│                          (audio + video track opcional)              │
│   touch_call(id) cada 60s ───► Postgres: calls.last_active_at       │
└─────────────────────────────────────────────────────────────────────┘
```

**Idea clave**: lo efímero (señalización ICE/offer/answer, presencia, mute, mood, screen share) viaja por **Supabase Broadcast + Presence** y **no se escribe a la base de datos**. Solo persistimos lo que el usuario querría ver al volver mañana: cuentas, llamadas y chat.

### Eventos Broadcast del canal de llamada

| Evento | Payload | Descripción |
|---|---|---|
| `signal` | `{ from, to, type, data }` | Señalización WebRTC (offer / answer / ICE) |
| `peer-state` | `{ uid, mood, isMuted, isSharingScreen }` | Estado dinámico del peer |
| `screen-share-request` | `{ fromUid, fromName }` | Solicitud para tomar el turno de presentador |
| `screen-share-response` | `{ toUid, accepted }` | Respuesta del presentador actual |

→ Detalles en [docs/00-architecture-decision.md](docs/00-architecture-decision.md).

---

## Screen Sharing

Screen sharing usa `addTrack` + renegociación SDP manual por peer:

1. `getDisplayMedia({ video: true })` obtiene el stream de pantalla.
2. Para cada `RTCPeerConnection` activa: `pc.addTrack(videoTrack, stream)` + `createOffer` / `setLocalDescription` / envío de offer por broadcast.
3. El receptor detecta `ontrack` con `kind === 'video'` → crea un nuevo `MediaStream([track])` para consistencia cross-browser.
4. Al detener: `pc.removeTrack(sender)` + renegociación inversa.

**Hero layout** — cuando `activeSharer !== null`:
- El `<main>` cambia de grid a `flex row`
- `HeroScreen`: `<video>` a pantalla completa + overlay con nombre del presentador
- Sidebar derecha: `ParticipantCard` en modo compacto (horizontal, sin slider), con controles de mic/share y moods anclados al fondo

---

## Correr localmente

**Requisitos**: Node.js 20+, un proyecto de Supabase (free tier basta).

1. **Clonar e instalar**
   ```bash
   git clone <repo>
   cd Comunicaciones-web-app
   npm install
   ```

2. **Configurar Supabase**
   - Crear un proyecto en https://supabase.com.
   - Aplicar las migraciones de `supabase/migrations/` (en orden) desde el SQL Editor o con Supabase CLI.
   - Habilitar providers Email y Google en Authentication → Providers.
   - Configurar `http://localhost:3000` como Site URL y Redirect URL en Authentication → URL Configuration.
   - Detalles paso a paso: [docs/01-supabase-bootstrap.md](docs/01-supabase-bootstrap.md).

3. **Variables de entorno**
   ```bash
   cp .env.example .env.local
   # Editar .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
   # del dashboard de Supabase (Settings → API → Project URL / anon key)
   ```

4. **Arrancar**
   ```bash
   npm run dev
   ```
   App en http://localhost:3000.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite dev server con HMR. |
| `npm run build` | Build de producción a `dist/`. |
| `npm run preview` | Sirve el build de prod. |
| `npm run lint` | `tsc --noEmit` — typecheck completo. |
| `npm run clean` | Borra `dist/`. |

---

## Estructura del repo

```
src/
├── App.tsx                # root: auth state + carga de perfil + ruteo
├── supabase.ts            # cliente Supabase
├── types.ts               # tipos compartidos (Participant, Call, DMMessage…)
├── index.css              # variables de tema, utilidades globales
├── components/
│   ├── Auth.tsx           # login/registro (email + Google OAuth)
│   ├── Dashboard.tsx      # listado y creación de llamadas + panel de amigos
│   ├── CallRoom.tsx       # llamada en curso: presence + WebRTC + screen share
│   ├── CallChatPanel.tsx  # chat deslizable dentro de la llamada
│   ├── FriendsPanel.tsx   # gestión de amigos y solicitudes
│   ├── DMWindow.tsx       # ventana de mensajes directos
│   └── Profile.tsx        # editor de perfil y tema
├── hooks/
│   ├── useWebRTC.ts       # WebRTC mesh: audio + screen share
│   ├── useAudioLevel.ts   # nivel de audio para animación de avatar
│   ├── useCallMessages.ts # chat de llamada (Supabase Realtime CDC)
│   ├── useFriends.ts      # sistema de amigos (friendships table)
│   └── useDMs.ts          # mensajes directos (dm_threads + dm_messages)
└── lib/
    └── utils.ts           # cn() helper (clsx + tailwind-merge)

public/
└── favicon.svg            # icono de teléfono adaptativo (light/dark)

supabase/migrations/
├── 0001_init.sql
├── 0002_harden_advisors.sql
└── 0003_handle_new_user_dicebear_fallback.sql

docs/
├── 00-architecture-decision.md
├── 01-supabase-bootstrap.md
├── 02-database-schema.md
├── 03-auth-migration.md
├── 04-dashboard-migration.md
├── 05-callroom-and-webrtc.md
├── 06-profile-migration.md
├── 07-cleanup-firebase.md
└── 08-verification.md
```

---

## Decisiones clave

Este proyecto se inició sobre **Firebase + Firestore** y fue migrado a **Supabase**. El motivo principal: Firestore se factura por operación, y una app de llamadas WebRTC genera *decenas de escrituras por minuto y por cliente* solo para señalizar ICE candidates → la cuota gratuita se evapora en segundos.

En Supabase, la señalización va por **Realtime Broadcast** (efímero, no toca DB), la presencia por **Realtime Presence** (idem) y solo lo persistente (cuentas, llamadas, chat) vive en Postgres protegido por RLS.

Detalles, tabla comparativa y trade-offs: [docs/00-architecture-decision.md](docs/00-architecture-decision.md).

---

## Documentación detallada

- [00 · Decisión de arquitectura](docs/00-architecture-decision.md)
- [01 · Bootstrap de Supabase](docs/01-supabase-bootstrap.md)
- [02 · Schema + RLS](docs/02-database-schema.md)
- [03 · Migración de Auth](docs/03-auth-migration.md)
- [04 · Migración de Dashboard](docs/04-dashboard-migration.md)
- [05 · CallRoom + WebRTC + Screen Share](docs/05-callroom-and-webrtc.md)
- [06 · Migración de Profile](docs/06-profile-migration.md)
- [07 · Limpieza de Firebase](docs/07-cleanup-firebase.md)
- [08 · Verificación E2E + medición de cuotas](docs/08-verification.md)

---

## Licencia

Proyecto personal de portafolio. Hecho por [Juan Gaitán](https://github.com/JuanGaitanD).
