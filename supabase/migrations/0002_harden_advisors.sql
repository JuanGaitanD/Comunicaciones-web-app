-- =====================================================================
-- 0002_harden_advisors.sql · Hardening tras advisors de Supabase
-- =====================================================================
-- Tras aplicar 0001_init.sql el linter detectó 3 advisors:
--
-- 1. extension_in_public      → pg_trgm vive en `public`. Mover a `extensions`.
-- 2. anon_security_definer_function_executable
--    + authenticated_security_definer_function_executable
--    → handle_new_user expuesta como RPC. Es un TRIGGER, no debe ser RPC.
--    → Revocar EXECUTE de public/anon/authenticated.
-- 3. anon_security_definer_function_executable (touch_call)
--    → Solo `authenticated` debe poder llamarla. Revocar `anon`.
--
-- Queda intencionalmente: authenticated puede ejecutar touch_call
-- (es el patrón heartbeat sin backend; documentado en docs/02).
-- =====================================================================

-- 1. Mover pg_trgm a schema dedicado.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 2. handle_new_user: trigger interno, no debe ser RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. touch_call: solo authenticated (revocar anon y public).
revoke execute on function public.touch_call(uuid) from public, anon;
-- grant execute ... to authenticated; ya fue otorgado en 0001.
