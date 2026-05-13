# Comunicaciones — Made by Jada

> App de llamadas grupales inspirada en Discord. Construida sobre **React 19 + TypeScript + Vite**, con **Supabase** (Auth + Postgres + Realtime) como backend y **WebRTC en mesh** para audio peer-to-peer.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4, Motion (animaciones), Lucide (iconos) |
| Backend | **Supabase** — Auth (email/password + Google OAuth), Postgres + Row Level Security, Realtime (Broadcast + Presence + CDC) |
| Tiempo real | WebRTC mesh para audio · Supabase Realtime para señalización, presencia y chat |
| Avatares | DiceBear (avataaars) |
| Deploy | GitHub Pages (build estático) |

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
│         │       │                                 │        │        │
│         └───────┴────── WebRTC P2P (audio) ───────┴────────┘        │
│                                                                     │
│   touch_call(id) cada 60s ───► Postgres: calls.last_active_at       │
└─────────────────────────────────────────────────────────────────────┘
```

**Idea clave**: lo efímero (señalización ICE/offer/answer, presencia, mute, mood) viaja por **Supabase Broadcast + Presence** y **no se escribe a la base de datos**. Solo persistimos lo que el usuario querría ver al volver mañana: cuentas, llamadas y (a futuro) chat.

→ Detalles en [docs/00-architecture-decision.md](docs/00-architecture-decision.md).

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
   # Editar .env.local con tu Project URL y publishable key del dashboard de Supabase
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
| `npm run lint` | `tsc --noEmit` — solo typecheck. |
| `npm run clean` | Borra `dist/`. |

---

## Estructura del repo

```
src/
├── App.tsx                # root: auth state + carga de perfil + ruteo simple
├── supabase.ts            # cliente Supabase
├── types.ts               # tipos compartidos
├── components/
│   ├── Auth.tsx           # login/registro (email + Google OAuth)
│   ├── Dashboard.tsx      # listado y creación de llamadas
│   ├── CallRoom.tsx       # llamada en curso: presence + WebRTC + UI
│   └── Profile.tsx        # editor de perfil y tema
├── hooks/
│   ├── useWebRTC.ts       # WebRTC mesh sobre canal Supabase
│   └── useAudioLevel.ts   # nivel de audio para animación
└── lib/
    └── utils.ts           # cn() helper (clsx + tailwind-merge)

supabase/migrations/
├── 0001_init.sql                            # schema + RLS + triggers + RPC
├── 0002_harden_advisors.sql                 # correcciones del linter
└── 0003_handle_new_user_dicebear_fallback.sql

docs/
├── 00-architecture-decision.md   # por qué Supabase sobre Firebase
├── 01-supabase-bootstrap.md      # crear proyecto, cliente, .env
├── 02-database-schema.md         # tablas, RLS, triggers
├── 03-auth-migration.md          # Auth.tsx + App.tsx
├── 04-dashboard-migration.md     # Dashboard.tsx
├── 05-callroom-and-webrtc.md     # CallRoom + Presence + Broadcast
├── 06-profile-migration.md       # Profile.tsx
├── 07-cleanup-firebase.md        # eliminación final
└── 08-verification.md            # checklist E2E + medición de cuotas
```

---

## Decisiones clave

Este proyecto se inició sobre **Firebase + Firestore** y fue migrado a **Supabase**. El motivo principal: Firestore se factura por operación, y una app de llamadas WebRTC genera *decenas de escrituras por minuto y por cliente* solo para señalizar ICE candidates → la cuota gratuita se evapora en segundos.

En Supabase, la señalización va por **Realtime Broadcast** (efímero, no toca DB), la presencia por **Realtime Presence** (idem) y solo lo persistente (cuentas, llamadas, chat futuro) vive en Postgres protegido por RLS.

Detalles, tabla comparativa y trade-offs: [docs/00-architecture-decision.md](docs/00-architecture-decision.md).

---

## Documentación detallada

Cada paso de la migración tiene su propio documento con objetivo, decisiones, snippets reales y resultado:

- [00 · Decisión de arquitectura](docs/00-architecture-decision.md)
- [01 · Bootstrap de Supabase](docs/01-supabase-bootstrap.md)
- [02 · Schema + RLS](docs/02-database-schema.md)
- [03 · Migración de Auth](docs/03-auth-migration.md)
- [04 · Migración de Dashboard](docs/04-dashboard-migration.md)
- [05 · CallRoom + WebRTC](docs/05-callroom-and-webrtc.md)
- [06 · Migración de Profile](docs/06-profile-migration.md)
- [07 · Limpieza de Firebase](docs/07-cleanup-firebase.md)
- [08 · Verificación E2E + medición de cuotas](docs/08-verification.md)

---

## Licencia

Proyecto personal de portafolio. Hecho por [Juan Gaitán](https://github.com/JuanGaitanD).
