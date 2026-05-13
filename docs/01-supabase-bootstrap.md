# 01 · Bootstrap de Supabase

> **Estado:** En curso · **Predecesor:** [00 · Decisión de arquitectura](00-architecture-decision.md) · **Sucesor:** [02 · Schema + RLS](02-database-schema.md)

---

## Objetivo

Dejar listo el cliente de Supabase en el código y las credenciales en variables de entorno, sin tocar todavía Firebase (la migración se hará archivo por archivo en pasos posteriores). Al final de este paso, `import { supabase } from './supabase'` ya funciona en el proyecto, en paralelo con el código Firebase existente.

---

## Contexto

Supabase ofrece tres piezas que necesitamos en una sola plataforma:

- **Auth** (compatible Google OAuth + email/password).
- **Postgres** con row-level security (RLS) — para `profiles`, `calls` y futuras tablas de chat/DMs.
- **Realtime** — con tres modos: *Postgres CDC* (suscribirse a cambios en tablas), *Broadcast* (mensajes efímeros pub/sub) y *Presence* (estado online compartido). Broadcast y Presence **no escriben a la base de datos** y son el corazón de la migración (señalización WebRTC + participantes en una llamada).

El SDK oficial es `@supabase/supabase-js` v2.

---

## Decisiones de este paso

1. **Variables de entorno con prefijo `VITE_`** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) para que Vite las exponga al cliente sin necesidad de pasarlas por `define` en `vite.config.ts`. Se leen con `import.meta.env`.
2. **Cliente único** exportado desde `src/supabase.ts` (paralelo a `src/firebase.ts` que se borrará en el paso 07).
3. **`.env.example` comiteado** con las claves vacías, para que cualquiera que clone el repo sepa qué configurar. El archivo real `.env.local` queda fuera del repo vía `.gitignore`.
4. **Auth providers**: se habilita Google OAuth + Email/Password en el dashboard de Supabase. La confirmación por email se deja **deshabilitada** durante desarrollo para no bloquear el flujo de prueba; se reactivará antes de "lanzar" el proyecto.

---

## Pasos de implementación

### 1. Crear el proyecto en Supabase (manual, lo hace el usuario)

1. Entrar a https://supabase.com y crear una cuenta (Google login es lo más rápido).
2. **New Project** → nombre `comunicaciones`, región más cercana (`East US (North Virginia)` o `South America (São Paulo)` desde Colombia), generar y **guardar** una contraseña fuerte para el Postgres.
3. Esperar ~2 minutos a que el proyecto se aprovisione.
4. En **Project Settings → API**, copiar:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public key** (clave pública, va al cliente — es segura porque RLS la protege)
5. En **Authentication → Providers**:
   - Habilitar **Email** (Confirm email: OFF para desarrollo).
   - Habilitar **Google**: requiere crear credenciales OAuth en Google Cloud Console y pegar Client ID + Client Secret. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (lo muestra Supabase).
6. En **Authentication → URL Configuration**: agregar `http://localhost:3000` como Site URL y como Redirect URL (para desarrollo).

### 2. Instalar la dependencia

```powershell
npm install @supabase/supabase-js
```

### 3. Crear `.env.example` y `.env.local`

`.env.example` (se comitea, sin valores):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`.env.local` (no se comitea — ya cubierto por `.gitignore` por defecto en proyectos Vite, validar):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4. Crear `src/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local. Ver docs/01-supabase-bootstrap.md.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // necesario para el callback de OAuth
  },
});
```

> Nota: `src/firebase.ts` sigue existiendo en este paso. La migración real de cada componente ocurre en los pasos 03–06. La limpieza final se hace en el paso 07.

---

## Verificación

1. `npm run dev` arranca sin errores.
2. Abrir la consola del navegador y ejecutar:
   ```js
   (await import('/src/supabase.ts')).supabase.auth.getSession()
   ```
   Debe devolver `{ data: { session: null }, error: null }` (sin sesión todavía, sin errores → conexión OK).
3. Comprobar que `import.meta.env.VITE_SUPABASE_URL` no es `undefined` (escribir un `console.log` temporal o usar la pestaña Sources del devtools).

---

## Resultado

Todo el paso se ejecutó automatizado vía el **MCP de Supabase** activado en Claude Code (Auth Pat → herramientas `mcp__supabase__*`). Eso permitió saltarse el flujo manual del dashboard para la creación del proyecto y la obtención de credenciales.

Hecho:

- ✅ `@supabase/supabase-js` instalado (`npm install @supabase/supabase-js`, +8 paquetes).
- ✅ `src/supabase.ts` creado con el cliente único exportado.
- ✅ `.env.example` actualizado con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` al inicio.
- ✅ `.gitignore` cubre `.env*` excepto `.env.example` (verificado con `git check-ignore`).
- ✅ Proyecto **`comunicaciones`** creado en la organización **`Portafolio Juan Gaitan`**, región `sa-east-1` (São Paulo), tier free ($0/mes), status `ACTIVE_HEALTHY`.
- ✅ Project ID: `aafcfjhuacccjdttijin`.
- ✅ URL: `https://aafcfjhuacccjdttijin.supabase.co`.
- ✅ Publishable key moderna (`sb_publishable_*`) obtenida y escrita en `.env.local`.
- ✅ `src/firebase.ts` permanece intacto: Firebase y Supabase conviven hasta el paso 07.

> **Nota sobre la clave:** se usó la **publishable key nueva** (`sb_publishable_*`) en vez del legacy anon JWT. `@supabase/supabase-js` v2 acepta ambas en `createClient`. Se mantiene el nombre de variable `VITE_SUPABASE_ANON_KEY` por compatibilidad con la documentación de Supabase, aunque el valor sea de tipo publishable.

Pendiente del usuario (manual, requiere navegador):

- [ ] **Habilitar providers Email + Google** en Authentication → Providers (no automatizable vía MCP).
- [ ] **Google OAuth**: crear credenciales en Google Cloud Console y pegar Client ID + Client Secret en el provider Google de Supabase. Authorized redirect URI: `https://aafcfjhuacccjdttijin.supabase.co/auth/v1/callback`.
- [ ] **URL configuration**: agregar `http://localhost:3000` como Site URL y Redirect URL para desarrollo.

> Estas tres cosas son las únicas que el MCP no puede hacer (involucran un proveedor externo o configuración fuera del scope del MCP). Pueden hacerse en paralelo con el paso 03.
