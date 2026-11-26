-- Developer-Client Queue app: schema + Row Level Security (Supabase / Postgres)
-- Model: a "developer" is whoever owns a workspace. A "client" is whoever has a
-- row in `clients` for that workspace. There is no role column, so nobody can
-- grant themselves a role.
-- Anonymity: a client can only ever read their OWN rows. Their queue position
-- comes from my_queue_status(), which returns a number, never other rows.

-- ============ TABLES ============

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open','paused','away')),
  away_message text,
  capacity int check (capacity is null or capacity > 0),
  est_days_per_client int not null default 7,
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses > 0),
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  stage text not null default 'queued'
    check (stage in ('queued','reviewing','in_progress','feedback','done')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (id, workspace_id)  -- lets child tables prove client and workspace match
);

create table public.queue_entries (
  client_id uuid primary key,
  workspace_id uuid not null,
  ticket_no int not null,            -- permanent ticket, never reused
  sort_key double precision not null, -- developer reorders by changing this
  state text not null default 'waiting'
    check (state in ('waiting','active','done','cancelled')),
  created_at timestamptz not null default now(),
  unique (workspace_id, ticket_no),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  body text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.style_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  palette jsonb not null default '[]',
  preview_url text,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.style_picks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  style_card_id uuid not null,
  kind text not null check (kind in ('like','favorite','dislike')),
  note text,
  unique (client_id, style_card_id),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade,
  foreign key (style_card_id, workspace_id)
    references public.style_cards (id, workspace_id) on delete cascade
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  sender_id uuid references auth.users(id),   -- null for AI messages
  sender_kind text not null check (sender_kind in ('developer','client','ai')),
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  author_id uuid not null references auth.users(id),
  body text not null,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  text text not null,
  done boolean not null default false,
  position int not null default 0,
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  uploader_id uuid not null references auth.users(id),
  storage_path text not null,
  name text not null,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  actor_id uuid,
  kind text not null,
  meta jsonb not null default '{}',
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

-- AI output waits here as a draft until the developer approves it.
-- Rows are inserted by the Edge Function (service role), not by the browser.
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  workspace_id uuid not null,
  kind text not null,  -- 'catch_up','draft_reply','tasks','spec','scope_check', ...
  output jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','discarded','sent')),
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

-- Developer-written answers the AI may use in Away mode.
create table public.ai_faq (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  question text not null,
  answer text not null
);

-- ============ INDEXES (columns the policies and queries filter on) ============

create index on public.invites (workspace_id);
create index on public.clients (workspace_id);
create index on public.clients (user_id);
create index on public.queue_entries (workspace_id, state, sort_key);
create index on public.requirements (client_id);
create index on public.style_picks (client_id);
create index on public.messages (client_id, created_at);
create index on public.notes (client_id);
create index on public.checklist_items (client_id);
create index on public.files (client_id);
create index on public.activity_log (client_id, created_at);
create index on public.ai_runs (client_id, created_at);

-- ============ HELPER FUNCTIONS (used by policies) ============
-- security definer avoids recursive policy checks; search_path is pinned for safety.

create or replace function public.is_ws_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces
                 where id = ws and owner_id = (select auth.uid()));
$$;

create or replace function public.is_my_client(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients
                 where id = cid and user_id = (select auth.uid()));
$$;

create or replace function public.is_ws_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients
                 where workspace_id = ws and user_id = (select auth.uid()));
$$;

-- ============ RPC FUNCTIONS (the only way to create invites / join / see position) ============

create or replace function public.create_invite(
  p_workspace uuid, p_days int default 7, p_max_uses int default 1)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not is_ws_owner(p_workspace) then raise exception 'not_allowed'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into invites (workspace_id, code, expires_at, max_uses)
  values (p_workspace, v_code, now() + make_interval(days => p_days), p_max_uses);
  return v_code;
end $$;

create or replace function public.redeem_invite(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv invites%rowtype;
  v_ws workspaces%rowtype;
  v_client uuid;
  v_ticket int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_inv from invites where code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked or v_inv.expires_at < now()
     or v_inv.uses >= v_inv.max_uses then
    raise exception 'invalid_invite';
  end if;

  select * into v_ws from workspaces where id = v_inv.workspace_id;
  if v_ws.owner_id = v_uid then raise exception 'owner_cannot_join'; end if;
  if v_ws.status = 'paused' then raise exception 'workspace_paused'; end if;
  if exists (select 1 from clients where workspace_id = v_ws.id and user_id = v_uid) then
    raise exception 'already_joined';
  end if;

  -- serialize ticket numbering per workspace so two joins can't get the same number
  perform pg_advisory_xact_lock(hashtext(v_ws.id::text));

  if v_ws.capacity is not null and
     (select count(*) from queue_entries
       where workspace_id = v_ws.id and state in ('waiting','active')) >= v_ws.capacity then
    raise exception 'workspace_full';
  end if;

  select coalesce(max(ticket_no), 0) + 1 into v_ticket
    from queue_entries where workspace_id = v_ws.id;

  insert into clients (workspace_id, user_id, display_name)
  values (v_ws.id, v_uid, left(trim(p_name), 80))
  returning id into v_client;

  insert into queue_entries (client_id, workspace_id, ticket_no, sort_key)
  values (v_client, v_ws.id, v_ticket, v_ticket);

  update invites set uses = uses + 1 where id = v_inv.id;

  insert into activity_log (workspace_id, client_id, actor_id, kind)
  values (v_ws.id, v_client, v_uid, 'client_joined');

  return v_client;
end $$;

-- Returns only the caller's own number and how many are ahead. Never other clients' data.
create or replace function public.my_queue_status(p_client uuid)
returns table (ticket_no int, queue_position int, state text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_my_client(p_client) then raise exception 'not_allowed'; end if;
  return query
    select q.ticket_no,
           1 + (select count(*)::int from queue_entries o
                 where o.workspace_id = q.workspace_id
                   and o.state = 'waiting'
                   and o.sort_key < q.sort_key),
           q.state
    from queue_entries q
    where q.client_id = p_client;
end $$;

revoke execute on function public.create_invite(uuid, int, int) from public, anon;
revoke execute on function public.redeem_invite(text, text)     from public, anon;
revoke execute on function public.my_queue_status(uuid)         from public, anon;
grant  execute on function public.create_invite(uuid, int, int) to authenticated;
grant  execute on function public.redeem_invite(text, text)     to authenticated;
grant  execute on function public.my_queue_status(uuid)         to authenticated;

-- ============ ROW LEVEL SECURITY ============

do $$
declare t text;
begin
  foreach t in array array['workspaces','invites','clients','queue_entries',
    'requirements','style_cards','style_picks','messages','notes',
    'checklist_items','files','activity_log','ai_runs','ai_faq'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- workspaces: owner manages; clients can read the ones they belong to (name, status, away message)
create policy ws_select on public.workspaces for select
  using (is_ws_owner(id) or is_ws_member(id));
create policy ws_insert on public.workspaces for insert
  with check (owner_id = (select auth.uid()));
create policy ws_update on public.workspaces for update
  using (is_ws_owner(id)) with check (owner_id = (select auth.uid()));
create policy ws_delete on public.workspaces for delete
  using (is_ws_owner(id));

-- invites: owner only (clients never read this table; they use redeem_invite)
create policy inv_select on public.invites for select using (is_ws_owner(workspace_id));
create policy inv_update on public.invites for update
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));

-- clients: owner sees all; a client sees only their own row. Rows are created by redeem_invite.
create policy cl_select on public.clients for select
  using (is_ws_owner(workspace_id) or user_id = (select auth.uid()));
create policy cl_update on public.clients for update
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy cl_delete on public.clients for delete
  using (is_ws_owner(workspace_id));

-- queue_entries: owner sees/reorders all; a client sees only their own entry
create policy q_select on public.queue_entries for select
  using (is_ws_owner(workspace_id) or is_my_client(client_id));
create policy q_update on public.queue_entries for update
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));

-- requirements: owner and that client
create policy req_owner on public.requirements for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy req_client on public.requirements for all
  using (is_my_client(client_id)) with check (is_my_client(client_id));

-- style_cards: owner manages; members of the workspace can read
create policy sc_owner on public.style_cards for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy sc_member on public.style_cards for select
  using (is_ws_member(workspace_id));

-- style_picks: client manages their own; owner reads
create policy sp_owner on public.style_picks for select
  using (is_ws_owner(workspace_id));
create policy sp_client on public.style_picks for all
  using (is_my_client(client_id)) with check (is_my_client(client_id));

-- messages: owner and that client read; each side can only send as themselves.
-- AI messages are inserted by the Edge Function (service role bypasses RLS).
create policy msg_select on public.messages for select
  using (is_ws_owner(workspace_id) or is_my_client(client_id));
create policy msg_insert_dev on public.messages for insert
  with check (is_ws_owner(workspace_id) and sender_kind = 'developer'
              and sender_id = (select auth.uid()));
create policy msg_insert_client on public.messages for insert
  with check (is_my_client(client_id) and sender_kind = 'client'
              and sender_id = (select auth.uid()));

-- notes: owner sees everything; a client sees only notes marked shared
create policy note_owner on public.notes for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy note_client on public.notes for select
  using (visibility = 'shared' and is_my_client(client_id));

-- checklist: owner manages; a client sees only items marked visible
create policy ck_owner on public.checklist_items for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy ck_client on public.checklist_items for select
  using (visible_to_client and is_my_client(client_id));

-- files (metadata): owner manages; client reads and uploads for themselves
create policy file_owner on public.files for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy file_client_select on public.files for select
  using (is_my_client(client_id));
create policy file_client_insert on public.files for insert
  with check (is_my_client(client_id) and uploader_id = (select auth.uid()));

-- activity_log: owner reads/writes; client sees only entries flagged client_visible
create policy log_owner_select on public.activity_log for select
  using (is_ws_owner(workspace_id));
create policy log_owner_insert on public.activity_log for insert
  with check (is_ws_owner(workspace_id) and actor_id = (select auth.uid()));
create policy log_client on public.activity_log for select
  using (client_visible and client_id is not null and is_my_client(client_id));

-- ai_runs: developer reads and approves/discards drafts; clients never see them
create policy ai_select on public.ai_runs for select using (is_ws_owner(workspace_id));
create policy ai_update on public.ai_runs for update
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));

-- ai_faq: developer only
create policy faq_owner on public.ai_faq for all
  using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));

-- ============ REALTIME ============
-- Realtime change events respect RLS, so users only receive rows they can select.
alter publication supabase_realtime add table public.messages, public.queue_entries, public.clients;

-- ============ GRANTS ============
-- New Supabase projects don't expose new tables to the Data API automatically.
-- Row Level Security above still decides which rows each person can see.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ============ LATER ADDITIONS (all in one place) ============
alter table public.workspaces add column away_ai boolean not null default false;
alter table public.clients add column preview_url text, add column status_note text;
alter table public.messages add column file_id uuid references public.files(id) on delete set null;

-- AI assistant chat sessions
create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete cascade
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  workspace_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  actions jsonb not null default '[]',
  done jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (session_id, workspace_id) references public.ai_sessions (id, workspace_id) on delete cascade
);
create index on public.ai_sessions (client_id, updated_at desc);
create index on public.ai_messages (session_id, created_at);
alter table public.ai_sessions enable row level security;
alter table public.ai_messages enable row level security;
create policy ais_owner on public.ai_sessions for all using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));
create policy aim_owner on public.ai_messages for all using (is_ws_owner(workspace_id)) with check (is_ws_owner(workspace_id));

-- clients may log their own file uploads
create policy log_client_insert on public.activity_log for insert
  with check (is_my_client(client_id) and actor_id = (select auth.uid()) and kind = 'file_uploaded');

-- file storage (path: workspace_id/client_id/filename)
insert into storage.buckets (id, name, public) values ('client-files', 'client-files', false) on conflict (id) do nothing;
create policy files_owner on storage.objects for all to authenticated
  using (bucket_id = 'client-files' and public.is_ws_owner(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'client-files' and public.is_ws_owner(((storage.foldername(name))[1])::uuid));
create policy files_client_read on storage.objects for select to authenticated
  using (bucket_id = 'client-files' and public.is_my_client(((storage.foldername(name))[2])::uuid));
create policy files_client_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files' and public.is_my_client(((storage.foldername(name))[2])::uuid));

-- grants for every table, including the ones added above
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;

-- Reminders are pinned notes. Run once in the Supabase SQL editor.
alter table public.notes add column if not exists pinned boolean not null default false;
