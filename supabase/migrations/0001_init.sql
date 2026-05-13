-- =====================================================================
-- 0001_init.sql · Migración inicial Comunicaciones (Firebase → Supabase)
-- Doc asociada: docs/02-database-schema.md
-- =====================================================================
--
-- Tablas persistentes:
--   profiles, calls, friendships, dm_threads, dm_messages, call_messages
--
-- NO están en este schema (viven en Realtime Presence/Broadcast, efímeros):
--   participants   → channel `call:{id}` presence state
--   signals (WebRTC) → channel `call:{id}` broadcast event 'signal'
-- =====================================================================


-- =====================================================================
-- Extensiones (deben ir primero: pg_trgm se usa en un índice GIN abajo)
-- =====================================================================
create extension if not exists pg_trgm;
create extension if not exists "pgcrypto"; -- para gen_random_uuid()


-- ---------------------------------------------------------------------
-- profiles
-- 1:1 con auth.users; se autopopula via trigger handle_new_user.
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  display_name    text        not null check (char_length(display_name) between 1 and 50),
  photo_url       text        not null default '',
  email           text        not null,
  theme           text        not null default 'default'
                              check (theme in ('default','ocean','sunset','forest')),
  is_dark_mode    boolean     not null default false,
  avatar_config   jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_display_name_idx on public.profiles using gin (display_name gin_trgm_ops);
-- nota: gin_trgm_ops requiere la extensión pg_trgm. Se habilita abajo.


-- ---------------------------------------------------------------------
-- calls
-- ---------------------------------------------------------------------
create table public.calls (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null check (char_length(name) between 1 and 100),
  creator_id      uuid        not null references auth.users(id) on delete set null,
  status          text        not null default 'active' check (status in ('active','ended')),
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  ended_at        timestamptz
);

create index calls_status_idx        on public.calls (status);
create index calls_creator_idx       on public.calls (creator_id);
create index calls_last_active_idx   on public.calls (last_active_at desc);


-- ---------------------------------------------------------------------
-- friendships
-- Pares ordenados (user_a_id < user_b_id) para evitar duplicados.
-- ---------------------------------------------------------------------
create table public.friendships (
  user_a_id     uuid        not null references auth.users(id) on delete cascade,
  user_b_id     uuid        not null references auth.users(id) on delete cascade,
  status        text        not null default 'pending'
                            check (status in ('pending','accepted','blocked')),
  requested_by  uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

create index friendships_user_b_idx on public.friendships (user_b_id);


-- ---------------------------------------------------------------------
-- dm_threads
-- Un thread por par de amigos (accepted).
-- ---------------------------------------------------------------------
create table public.dm_threads (
  id              uuid        primary key default gen_random_uuid(),
  user_a_id       uuid        not null references auth.users(id) on delete cascade,
  user_b_id       uuid        not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

create index dm_threads_user_a_idx on public.dm_threads (user_a_id);
create index dm_threads_user_b_idx on public.dm_threads (user_b_id);


-- ---------------------------------------------------------------------
-- dm_messages
-- ---------------------------------------------------------------------
create table public.dm_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.dm_threads(id) on delete cascade,
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  body        text        not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);


-- ---------------------------------------------------------------------
-- call_messages (chat de texto dentro de una llamada, persiste)
-- ---------------------------------------------------------------------
create table public.call_messages (
  id          uuid        primary key default gen_random_uuid(),
  call_id     uuid        not null references public.calls(id) on delete cascade,
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  body        text        not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index call_messages_call_idx on public.call_messages (call_id, created_at);


-- =====================================================================
-- Trigger: al crear usuario en auth.users, crear su fila en profiles.
-- Toma display_name/avatar de raw_user_meta_data (Google OAuth) o
-- cae al fallback (parte local del email).
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, photo_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      ''
    ),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- =====================================================================
-- Trigger: updated_at automático en profiles y friendships.
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

create trigger friendships_touch_updated
  before update on public.friendships
  for each row execute procedure public.touch_updated_at();


-- =====================================================================
-- RLS · habilitar en todas las tablas
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.calls         enable row level security;
alter table public.friendships   enable row level security;
alter table public.dm_threads    enable row level security;
alter table public.dm_messages   enable row level security;
alter table public.call_messages enable row level security;


-- ---------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------
create policy "profiles select autenticados"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles update propio"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT no se necesita: lo hace el trigger handle_new_user con security definer.


-- ---------------------------------------------------------------------
-- RLS: calls
-- ---------------------------------------------------------------------
create policy "calls select autenticados"
  on public.calls for select
  to authenticated
  using (true);

create policy "calls insert autenticados (creator = auth.uid())"
  on public.calls for insert
  to authenticated
  with check (creator_id = auth.uid());

-- update: el creador puede modificar todo; cualquier autenticado puede
-- actualizar SOLO last_active_at y status (para heartbeat / cierre).
create policy "calls update creator total"
  on public.calls for update
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- Para heartbeat de no-creadores, usar la RPC `touch_call` (definida abajo)
-- en vez de UPDATE directo.


-- ---------------------------------------------------------------------
-- RLS: friendships
-- ---------------------------------------------------------------------
create policy "friendships select propias"
  on public.friendships for select
  to authenticated
  using (auth.uid() in (user_a_id, user_b_id));

create policy "friendships insert si soy parte y requested_by = yo"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() in (user_a_id, user_b_id)
    and auth.uid() = requested_by
  );

create policy "friendships update si soy parte"
  on public.friendships for update
  to authenticated
  using (auth.uid() in (user_a_id, user_b_id))
  with check (auth.uid() in (user_a_id, user_b_id));

create policy "friendships delete si soy parte"
  on public.friendships for delete
  to authenticated
  using (auth.uid() in (user_a_id, user_b_id));


-- ---------------------------------------------------------------------
-- RLS: dm_threads
-- ---------------------------------------------------------------------
create policy "dm_threads select si soy parte"
  on public.dm_threads for select
  to authenticated
  using (auth.uid() in (user_a_id, user_b_id));

create policy "dm_threads insert si soy parte y somos amigos accepted"
  on public.dm_threads for insert
  to authenticated
  with check (
    auth.uid() in (user_a_id, user_b_id)
    and exists (
      select 1 from public.friendships f
      where f.user_a_id = dm_threads.user_a_id
        and f.user_b_id = dm_threads.user_b_id
        and f.status = 'accepted'
    )
  );


-- ---------------------------------------------------------------------
-- RLS: dm_messages
-- ---------------------------------------------------------------------
create policy "dm_messages select si soy parte del thread"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  );

create policy "dm_messages insert si soy sender y parte del thread"
  on public.dm_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  );


-- ---------------------------------------------------------------------
-- RLS: call_messages
-- En llamadas grupales abiertas; SELECT autenticados.
-- INSERT solo si soy el sender.
-- ---------------------------------------------------------------------
create policy "call_messages select autenticados"
  on public.call_messages for select
  to authenticated
  using (true);

create policy "call_messages insert si soy sender"
  on public.call_messages for insert
  to authenticated
  with check (sender_id = auth.uid());


-- =====================================================================
-- RPC: touch_call(call_id)
-- Permite a cualquier participante actualizar `last_active_at`
-- sin abrir UPDATE general a no-creadores.
-- =====================================================================
create or replace function public.touch_call(p_call_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.calls
     set last_active_at = now()
   where id = p_call_id and status = 'active';
$$;

grant execute on function public.touch_call(uuid) to authenticated;


-- =====================================================================
-- Realtime: incluir en publication `supabase_realtime` solo lo persistente
-- que queremos suscribir desde el cliente (chat).
-- =====================================================================
alter publication supabase_realtime add table public.dm_messages;
alter publication supabase_realtime add table public.call_messages;
alter publication supabase_realtime add table public.calls;
