# 02 · Schema de base de datos + Row Level Security

> **Estado:** SQL listo, pendiente aplicar en Supabase · **Predecesor:** [01 · Bootstrap](01-supabase-bootstrap.md) · **Sucesor:** [03 · Auth](03-auth-migration.md)

---

## Objetivo

Definir el modelo persistente en Postgres con políticas RLS estrictas que sustituyen las `firestore.rules` actuales. Al final de este paso, la base de datos de Supabase tiene todas las tablas necesarias (presentes y futuras) y cualquier cliente autenticado puede operar sobre ellas sin necesidad de un backend propio: las políticas RLS son el control de acceso.

---

## Decisiones clave

### 1. Qué persiste y qué no

| Entidad | Antes (Firestore) | Ahora | Justificación |
|---|---|---|---|
| `users` | `users/{uid}` | tabla `profiles` | Persiste — datos de perfil. |
| `calls` | `calls/{callId}` | tabla `calls` | Persiste — historial de llamadas. |
| `participants` | subcolección | **Realtime Presence** (no DB) | Efímero — solo importa quién está conectado *ahora*. |
| `signals` (WebRTC) | subcolección | **Realtime Broadcast** (no DB) | Efímero y altísima frecuencia → era el causante del quemado de cuota. |
| `mood` / `isMuted` | campos de participant | parte del payload de Presence | Efímeros. |
| Chat de llamada | (no existía) | tabla `call_messages` | Persiste — historial visible al volver a entrar. |
| DMs | (no existía) | `dm_threads` + `dm_messages` | Persiste — DMs entre amigos. |
| Amistad | (no existía) | `friendships` | Persiste — relación con estado. |

> **Lección estructural**: lo que **cambia muchas veces por segundo** (señalización, estado de mute) **no toca DB**. Solo persiste lo que el usuario querría ver al volver mañana.

### 2. Modelo de amistad

Se usa **par ordenado** (`user_a_id < user_b_id`) como PK. Esto evita el problema clásico de tener dos filas para una misma amistad (A→B y B→A) y simplifica todas las queries de "¿son amigos?". El campo `requested_by` identifica quién mandó la solicitud (para mostrar UI distinta a quien envía vs recibe). Status: `pending`, `accepted`, `blocked`.

### 3. Trigger `handle_new_user`

Cuando un usuario se registra (email/password o Google OAuth), Supabase crea fila en `auth.users`. Un trigger automáticamente crea la fila correspondiente en `public.profiles`, tomando `display_name` y `photo_url` de:

- `raw_user_meta_data.name` o `full_name` (Google OAuth los rellena automáticamente).
- Si no hay metadata, fallback a `split_part(email, '@', 1)` para tener algo razonable.

Esto elimina el código actual en `Auth.tsx` que hace `setDoc` manual tras el registro — el trigger lo hace por nosotros con `security definer`.

### 4. Política RLS de `calls`: heartbeat

El campo `last_active_at` se actualiza periódicamente para que el auto-cleanup de llamadas inactivas funcione. Pero NO queremos que cualquier autenticado pueda hacer `UPDATE` arbitrario sobre `calls` (solo el creador puede). La solución:

- RLS de `UPDATE` directo: solo el `creator_id`.
- Función RPC `touch_call(call_id)` con `security definer` que cualquier autenticado puede llamar — pero **solo** actualiza `last_active_at`. Sin riesgo de escalamiento.

```ts
// En cliente:
await supabase.rpc('touch_call', { p_call_id: callId });
```

### 5. Realtime publication

Solo se incluyen en `supabase_realtime`:

- `calls` (para que el dashboard vea cambios de status en vivo).
- `dm_messages` y `call_messages` (para chat en vivo).

`profiles`, `friendships` y `dm_threads` **no** se suscriben con CDC porque cambian poco — se refetchan bajo demanda. Esto baja el costo de mensajes Realtime.

---

## Pasos de implementación

### 1. Crear el archivo de migración (hecho automáticamente)

`supabase/migrations/0001_init.sql` ya está en el repo.

### 2. Aplicar la migración en el proyecto de Supabase

**Opción A — vía dashboard (más rápido para arrancar):**

1. Entrar al proyecto en supabase.com.
2. **SQL Editor → New query**.
3. Pegar el contenido íntegro de `supabase/migrations/0001_init.sql`.
4. **Run**. Debe ejecutarse sin errores. Tiempo esperado: <5 s.

**Opción B — vía Supabase CLI (recomendado largo plazo):**

```powershell
# Instalar CLI (una sola vez)
npm install -g supabase

# Linkear el proyecto
supabase login
supabase link --project-ref <project-ref-de-tu-URL>

# Aplicar migraciones
supabase db push
```

### 3. Verificar en el dashboard

1. **Table Editor**: deben aparecer `profiles`, `calls`, `friendships`, `dm_threads`, `dm_messages`, `call_messages`.
2. **Authentication → Policies**: cada tabla debe mostrar las políticas RLS creadas (todas con candado verde "RLS enabled").
3. **Database → Publications → supabase_realtime**: deben estar `calls`, `dm_messages`, `call_messages`.

---

## Verificación

Registrar un usuario de prueba (desde la pestaña Authentication del dashboard → "Add user" → "Send invite" o crear con email/password):

1. Tras crear el usuario, ir a **Table Editor → profiles** → debe existir una fila con su `id`, `email` y un `display_name` razonable (parte local del email).
2. Desde el SQL editor, con `SET LOCAL role authenticated; SET LOCAL request.jwt.claim.sub = '<user-id>';`, intentar:
   - `select * from profiles;` → debe devolver al menos su fila.
   - `update profiles set display_name = 'X' where id = '<otro-id>';` → debe fallar (0 filas).
3. Intentar `insert into calls (name, creator_id) values ('Test', '<otro-id>');` → debe fallar (with check viola RLS).
4. Llamar `select touch_call('<call-id>');` → debe ejecutar sin error.

---

## Resultado

Migración aplicada automáticamente vía MCP de Supabase. Quedan dos archivos en el repo:

- `supabase/migrations/0001_init.sql` — schema completo + RLS + triggers + RPC + publication.
- `supabase/migrations/0002_harden_advisors.sql` — correcciones de los advisors del linter (ver más abajo).

Resultado verificado en el proyecto `aafcfjhuacccjdttijin`:

| Tabla | RLS | Filas |
|---|---|---|
| `public.profiles` | ✅ | 0 |
| `public.calls` | ✅ | 0 |
| `public.friendships` | ✅ | 0 |
| `public.dm_threads` | ✅ | 0 |
| `public.dm_messages` | ✅ | 0 |
| `public.call_messages` | ✅ | 0 |

Migraciones registradas:

```
20260513004401  init_schema_profiles_calls_dms
20260513004412  harden_advisors_extensions_and_rpcs
```

### Advisors del linter inicial y cómo se resolvieron

Tras `0001_init.sql`, Supabase reportó 3 advisors de seguridad (todos WARN, no ERROR). La migración `0002` los limpió así:

1. **`extension_in_public` · `pg_trgm`** → movida a un schema `extensions` dedicado (`alter extension pg_trgm set schema extensions`).
2. **`handle_new_user` ejecutable como RPC por `anon` y `authenticated`** → es un trigger interno, no debe ser RPC. Resuelto con `revoke execute on function public.handle_new_user() from public, anon, authenticated`.
3. **`touch_call` ejecutable por `anon`** → no debe poder llamarla un usuario sin sesión. Resuelto con `revoke execute on function public.touch_call(uuid) from public, anon`.

### Advisor restante (intencional, no es bug)

`touch_call(uuid)` sigue siendo ejecutable por `authenticated` como `SECURITY DEFINER`. **Es exactamente lo que queremos**: el patrón heartbeat requiere que cualquier participante autenticado pueda actualizar `last_active_at` sin tener `UPDATE` general sobre la tabla `calls`. Sin un backend propio, esta es la forma limpia de hacerlo. El advisor (`0029_authenticated_security_definer_function_executable`) solo pregunta "¿es intencional?", y la respuesta es sí.

Trade-off aceptado: cualquier authenticated puede llamar `touch_call` sobre cualquier `call_id` activo. Esto significa que un usuario malicioso podría mantener viva una llamada inactiva. Aceptable para portafolio; si se quisiera reforzar, habría que validar dentro de la función que el caller tiene un participant_id reciente — pero como `participants` vive en Realtime Presence (no DB), no hay forma server-side de verificarlo sin reintroducir persistencia.
