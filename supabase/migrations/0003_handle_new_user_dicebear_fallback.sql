-- =====================================================================
-- 0003_handle_new_user_dicebear_fallback.sql
-- =====================================================================
-- Mejora del trigger handle_new_user: si no hay avatar en raw_user_meta_data
-- (caso típico: signup con email/password), generar uno DiceBear automáticamente
-- usando el id del usuario como seed. Esto elimina la necesidad de que el
-- cliente haga un UPDATE adicional tras signUp (que falla cuando email
-- confirmation está activo, porque aún no hay sesión).
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo text;
begin
  v_photo := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.id::text
  );

  insert into public.profiles (id, display_name, photo_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    v_photo,
    new.email
  );
  return new;
end;
$$;

-- create or replace puede restaurar permisos; volver a revocar.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Backfill de perfiles existentes con photo_url vacío.
update public.profiles
set photo_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || id::text
where photo_url = '' or photo_url is null;
