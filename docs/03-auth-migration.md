# 03 · Migración de Auth a Supabase

> **Estado:** En curso · **Predecesor:** [02 · Schema](02-database-schema.md) · **Sucesor:** [04 · Calls + Presence](04-calls-and-presence.md)

---

## Objetivo

Reemplazar Firebase Auth por Supabase Auth en los componentes `Auth.tsx` y `App.tsx`, conservando el resto del código intacto (Dashboard, CallRoom, Profile siguen usando Firestore por ahora — se migran después). Al final del paso, registrarse e iniciar sesión funciona contra Supabase, y la fila en `profiles` se crea automáticamente vía el trigger SQL que ya existe.

---

## Contexto

Firebase Auth tenía dos partes en este proyecto:

1. **Autenticación**: Google OAuth y Email/Password (en `Auth.tsx`).
2. **Side-effect tras registro**: crear manualmente el documento `users/{uid}` con valores por defecto (también en `Auth.tsx`).

En Supabase ambas cosas se simplifican:

- **Autenticación**: `supabase.auth.signInWithOAuth({ provider: 'google' })`, `signInWithPassword`, `signUp`.
- **Side-effect**: el trigger `handle_new_user` (ya creado en migración `0001`) inserta la fila en `profiles` automáticamente cuando se crea el usuario en `auth.users`. **No hay que hacer nada desde el cliente.**

`App.tsx` también cambia: en vez de `onAuthStateChanged + onSnapshot(doc('users', uid))`, usa `supabase.auth.onAuthStateChange` y un fetch de `profiles` (con refetch bajo demanda, sin Realtime — ese costo no se justifica para un perfil que cambia rara vez).

---

## Decisiones

### 1. Mantener la forma `UserProfile` (camelCase) intacta

La tabla en Postgres usa snake_case (`display_name`, `photo_url`, `is_dark_mode`, `avatar_config`), pero los componentes que aún no migramos (Dashboard, CallRoom, Profile) esperan el tipo `UserProfile` con camelCase. Para no propagar cambios:

- Hay una función `rowToProfile(row)` en `App.tsx` que mapea snake_case → camelCase al cargar.
- El tipo `UserProfile` en `src/types.ts` queda igual.
- Cuando lleguemos al paso 06 (Profile), normalizamos.

### 2. Avatar por defecto al registrarse con email/password

El trigger SQL inserta `photo_url = ''` si no hay metadata OAuth. Para no tener avatares vacíos, tras un `signUp` exitoso por email/password se hace un `update profiles set photo_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed={uid}'` desde el cliente. RLS permite la operación porque el propio usuario actualiza su fila.

Para OAuth con Google, `raw_user_meta_data.picture` viene rellenado y el trigger lo guarda automáticamente — no hace falta hacer nada extra.

### 3. Sin Realtime para `profiles`

Los cambios al perfil (tema, dark mode, avatar) ocurren raramente y siempre los inicia el propio usuario desde `Profile.tsx`. Refetch manual tras update es más barato y simple que mantener una suscripción Postgres CDC abierta. `profiles` no está en la publication `supabase_realtime`.

### 4. `firestore-errors.ts` por ahora se deja vivo

`Auth.tsx` antes llamaba `handleFirestoreError`. Como ahora no se hacen escrituras a Firestore desde Auth, simplemente eliminamos esos imports. La lib sigue existiendo hasta el paso 07 (limpieza), donde se borrará.

---

## Cambios concretos

### `src/components/Auth.tsx`

**Antes:**
```ts
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, ... } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
```

**Después:**
```ts
import { supabase } from '../supabase';
```

Flujos:

- **Google OAuth** → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`. La redirección vuelve a la app con la sesión seteada; el listener de `App.tsx` recoge el evento.
- **Login email/password** → `supabase.auth.signInWithPassword({ email, password })`.
- **Registro email/password** → `supabase.auth.signUp({ email, password, options: { data: { name: displayName } } })`. El `data` se guarda en `raw_user_meta_data`; el trigger lo lee y rellena `profiles.display_name`. Tras el signUp, se actualiza `photo_url` con DiceBear.

### `src/App.tsx`

**Antes:**
- `onAuthStateChanged(auth, ...)`
- `onSnapshot(doc(db, 'users', uid), ...)`
- `signOut(auth)`

**Después:**
- `supabase.auth.getSession()` (carga inicial).
- `supabase.auth.onAuthStateChange((event, session) => ...)`.
- `supabase.from('profiles').select('*').eq('id', uid).single()` + helper `rowToProfile`.
- `supabase.auth.signOut()`.

---

## Verificación

1. `npm run dev` y abrir `http://localhost:3000`.
2. **Registro email/password**: completar nombre/email/password → al cargar el dashboard, verificar que el avatar DiceBear se muestra. En el dashboard de Supabase → Table Editor → `profiles`: la fila debe existir con `display_name` correcto y `photo_url` con la URL DiceBear.
3. **Login email/password** con la misma cuenta tras cerrar sesión.
4. **Google OAuth**: requiere haber configurado el provider Google en Supabase (ver `docs/01`). Si está configurado, hacer click en "Acceder con Google" debe abrir el consentimiento de Google y al volver dejar al usuario logueado con su foto de perfil real.
5. **Logout**: el botón de cerrar sesión debe vaciar el state y mostrar de nuevo el formulario de Auth.

---

## Resultado

Hecho:

- ✅ `src/components/Auth.tsx` reescrito sobre Supabase Auth. Eliminados imports de `firebase/auth`, `firebase/firestore` y `firestore-errors`.
- ✅ Tras `signUp` por email/password, el cliente actualiza `photo_url` con DiceBear (RLS permite porque es la fila propia).
- ✅ Google OAuth usa `redirectTo: window.location.origin` para volver a la app tras el consent.
- ✅ `src/App.tsx` reescrito: usa `supabase.auth.getSession()` (carga inicial) + `onAuthStateChange` (subscripción). Sin race conditions (flag `mounted`).
- ✅ Carga de perfil con `supabase.from('profiles').select().eq('id', uid).maybeSingle()` + helper `rowToProfile` para mapear snake_case → camelCase y mantener el contrato actual de `UserProfile` que aún consumen Dashboard/CallRoom/Profile.
- ✅ Helper `applyTheme` extraído como función pura.
- ✅ `src/vite-env.d.ts` creado para tipar `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- ✅ `npm run lint` (tsc --noEmit) pasa sin errores.

Estado: Auth migrado completamente. Firebase Auth deja de invocarse. Firestore aún en uso por Dashboard/CallRoom/Profile (se migran en pasos 04–06). El archivo `src/firebase.ts` y la dep `firebase` se eliminan en el paso 07.

Pendiente real: prueba E2E con un usuario de verdad — se hará en el paso 08 (verificación), no aquí, porque los demás componentes todavía dependen de Firestore. Una prueba ahora dejaría a Dashboard intentando leer una colección Firestore que ya no se va a poblar.
