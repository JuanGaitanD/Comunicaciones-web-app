# 06 · Migración de Profile a tabla `profiles`

> **Estado:** En curso · **Predecesor:** [05 · CallRoom + WebRTC](05-callroom-and-webrtc.md) · **Sucesor:** [07 · Limpieza Firebase](07-cleanup-firebase.md)

---

## Objetivo

Reemplazar el `updateDoc(users/{uid})` de Firestore por un `update()` sobre `public.profiles` en Supabase, y propagar el cambio a `App.tsx` para que la UI refleje el nuevo perfil sin recargar la página.

---

## Decisiones

### 1. Sin Realtime sobre `profiles`

Como se decidió en el paso 03, `profiles` no está en la publication Realtime — los cambios al perfil son raros y siempre los inicia el propio usuario desde este componente. En vez de pagar el costo de una suscripción CDC abierta, propagamos el cambio con un **callback explícito**: `Profile.tsx` recibe una prop `onProfileUpdated`, y al guardar llama esa función para que `App.tsx` re-fetch el perfil.

### 2. Mapeo camelCase → snake_case al guardar

```ts
await supabase
  .from('profiles')
  .update({
    display_name: displayName,
    photo_url: getAvatarUrl(avatarConfig),
    avatar_config: avatarConfig,
    theme,
    is_dark_mode: isDarkMode,
  })
  .eq('id', user.id);
```

`avatar_config` es un campo `jsonb` — Supabase lo serializa automáticamente desde el objeto JS.

### 3. RLS permite la operación

La policy `profiles update propio` valida `auth.uid() = id`. Como el cliente está autenticado y solo edita su fila, pasa sin problema.

### 4. `userProfile.uid` viene de App, no de `auth.currentUser`

Antes el componente usaba `auth.currentUser?.uid` (Firebase). Ahora lo lee de la prop `userProfile.uid`, que `App.tsx` ya tiene mapeado desde Supabase Auth.

---

## Cambios en código

- **`src/components/Profile.tsx`**:
  - Reemplazo de imports `firebase/firestore` → `../supabase`.
  - Eliminado import de `firestore-errors`.
  - `handleSave` usa `supabase.from('profiles').update({...}).eq('id', userProfile.uid)`.
  - Tras éxito, llama `await onProfileUpdated?.()` para que App refetch el perfil.
- **`src/App.tsx`**:
  - Pasar la prop `onProfileUpdated={() => loadProfile(user.id)}` al `<Profile />`.
  - El callback ya existe internamente (`loadProfile` es `useCallback`), solo se expone.

---

## Verificación

1. Abrir Ajustes (botón en el header del dashboard).
2. Cambiar `displayName`, randomizar el avatar, alternar tema y modo oscuro.
3. Guardar.
4. Tras cerrar el modal, el avatar y el nombre del header del Dashboard deben reflejar los cambios sin recargar.
5. En Supabase → Table Editor → `profiles` → la fila debe mostrar los nuevos valores (`display_name`, `photo_url`, `avatar_config jsonb`, `theme`, `is_dark_mode`, `updated_at` nuevo).
6. Recargar la página: los cambios persisten.

---

## Resultado

Hecho:

- ✅ `src/components/Profile.tsx` reescrito sobre Supabase. Eliminados imports `firebase/firestore`, `firebase`, `firestore-errors`.
- ✅ `handleSave` mapea camelCase → snake_case y usa `supabase.from('profiles').update(...).eq('id', userProfile.uid)`.
- ✅ Nueva prop opcional `onProfileUpdated` que App invoca para refetch tras guardar.
- ✅ `src/App.tsx` actualizado: `<Profile onProfileUpdated={() => user && loadProfile(user.id)} />`. El callback `loadProfile` ya era `useCallback` estable, solo se expone.
- ✅ Aplicación de tema/dark mode en tiempo real al cambiar selects (preview inmediato sin guardar).
- ✅ `npm run lint` pasa sin errores.

Después de este paso, **ningún componente del proyecto importa de `firebase/*` salvo `firebase.ts` y `firestore-errors.ts`** — esos dos se borran en el paso 07.
