-- =====================================================================
-- Migración 0005: visibilidad de llamadas (pública/privada) +
-- invitaciones por link a no-amigos.
--
-- Cambios:
--   1. Columnas `visibility` e `invite_code` en `calls`.
--   2. Tabla `call_invited_users` para autorización vía link.
--   3. Función helper `user_can_access_call`.
--   4. Reemplazo de policy SELECT en `calls`.
--   5. Endurecimiento de RLS en `call_messages`.
--   6. RPC `join_call_by_invite(p_code)`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en `calls`
-- ---------------------------------------------------------------------
alter table public.calls
  add column visibility text not null default 'public'
    check (visibility in ('public','private')),
  add column invite_code text unique;

-- invite_code DEBE ser NULL para públicas y NOT NULL para privadas.
alter table public.calls
  add constraint calls_invite_code_visibility_chk
  check (
    (visibility = 'public'  and invite_code is null) or
    (visibility = 'private' and invite_code is not null)
  );

create index calls_visibility_idx on public.calls (visibility);
-- Index parcial: solo cubre filas privadas. Lookups por code en O(log n)
-- sobre el subconjunto privado; las públicas no aumentan el tamaño.
create index calls_invite_code_idx on public.calls (invite_code) where invite_code is not null;


-- ---------------------------------------------------------------------
-- 2. Tabla `call_invited_users`
--    Persiste la autorización de invitados por link. Sus inserts solo
--    suceden vía la RPC `join_call_by_invite` (security definer).
-- ---------------------------------------------------------------------
create table public.call_invited_users (
  call_id   uuid        not null references public.calls(id) on delete cascade,
  user_id   uuid        not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (call_id, user_id)
);
alter table public.call_invited_users enable row level security;

create policy "call_invited_users select propios"
  on public.call_invited_users for select
  to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 3. Helper: ¿el usuario puede acceder a esta llamada?
--    security definer permite consultar friendships/call_invited_users
--    saltando RLS, evitando recursion al usarlo en policies de
--    call_messages.
-- ---------------------------------------------------------------------
create or replace function public.user_can_access_call(p_call_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.calls c
    where c.id = p_call_id
      and (
        c.visibility = 'public'
        or c.creator_id = p_uid
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.user_a_id = c.creator_id and f.user_b_id = p_uid)
              or (f.user_a_id = p_uid and f.user_b_id = c.creator_id))
        )
        or exists (
          select 1 from public.call_invited_users i
          where i.call_id = c.id and i.user_id = p_uid
        )
      )
  );
$$;
grant execute on function public.user_can_access_call(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Reemplazar policy SELECT en `calls`
-- ---------------------------------------------------------------------
drop policy "calls select autenticados" on public.calls;

create policy "calls select listables"
  on public.calls for select
  to authenticated
  using (
    visibility = 'public'
    or creator_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_a_id = calls.creator_id and f.user_b_id = auth.uid())
          or (f.user_a_id = auth.uid() and f.user_b_id = calls.creator_id))
    )
    or exists (
      select 1 from public.call_invited_users i
      where i.call_id = calls.id and i.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------
-- 5. Endurecer RLS en `call_messages`
-- ---------------------------------------------------------------------
drop policy "call_messages select autenticados" on public.call_messages;
drop policy "call_messages insert propio" on public.call_messages;

create policy "call_messages select si puedo acceder a la call"
  on public.call_messages for select to authenticated
  using (public.user_can_access_call(call_id, auth.uid()));

create policy "call_messages insert si soy sender y puedo acceder"
  on public.call_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.user_can_access_call(call_id, auth.uid())
  );


-- ---------------------------------------------------------------------
-- 6. RPC: unirse por invite_code
--    Filtra status='active' server-side, registra al invitado, y
--    retorna el call_id para que el cliente redirija al CallRoom.
-- ---------------------------------------------------------------------
create or replace function public.join_call_by_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_call_id    uuid;
  v_creator_id uuid;
begin
  select id, creator_id into v_call_id, v_creator_id
    from public.calls
    where invite_code = p_code and status = 'active'
    limit 1;
  if v_call_id is null then
    raise exception 'Invitación inválida o llamada terminada';
  end if;
  -- El creador ya tiene acceso por la rama `creator_id = p_uid` en
  -- user_can_access_call. Evitamos insertarlo para mantener
  -- call_invited_users limpio (solo invitados reales).
  if auth.uid() <> v_creator_id then
    insert into public.call_invited_users(call_id, user_id)
      values (v_call_id, auth.uid())
      on conflict do nothing;
  end if;
  return v_call_id;
end;
$$;
grant execute on function public.join_call_by_invite(text) to authenticated;
