BEGIN;

-- DevChat: first-time client onboarding / project brief.
-- Run once in the Supabase SQL editor after the existing schema.sql.

-- Existing clients are treated as already onboarded. New clients created by
-- redeem_invite receive NULL and are sent to the onboarding wizard.
alter table public.clients
  add column if not exists onboarding_completed_at timestamptz;

update public.clients
set onboarding_completed_at = coalesce(created_at, now())
where onboarding_completed_at is null;

-- Mark which requirements came from the onboarding wizard so a save/retry
-- never deletes items the client later adds from the Requirements tab.
alter table public.requirements
  add column if not exists is_onboarding boolean not null default false;

create table if not exists public.client_briefs (
  client_id uuid primary key,
  workspace_id uuid not null,
  project_type text not null check (project_type in ('landing_page','business_site','portfolio','ecommerce')),
  goal text not null,
  palette_name text not null,
  palette_colors jsonb not null default '[]'::jsonb,
  timeline text,
  extra_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade
);

create index if not exists client_briefs_workspace_idx
  on public.client_briefs (workspace_id);

alter table public.client_briefs enable row level security;
grant select on public.client_briefs to authenticated;

drop policy if exists client_briefs_owner_select on public.client_briefs;
create policy client_briefs_owner_select on public.client_briefs
  for select using (public.is_ws_owner(workspace_id));

drop policy if exists client_briefs_client_select on public.client_briefs;
create policy client_briefs_client_select on public.client_briefs
  for select using (public.is_my_client(client_id));

-- The 12 curated style references used by the onboarding gallery.
-- Keep existing workspace-specific style cards; these are additive.
insert into public.style_cards (workspace_id, title, description, palette)
select w.id, s.title, s.description, to_jsonb(s.palette)
from public.workspaces w
cross join (values
  ('Swiss Architectural', 'Ultra-clean architectural whitespace with a floating gallery card and sharp black-and-white structure.', array['#FFFFFF','#ECECE9','#111111','#8A8A8E']::text[]),
  ('Dark Tech Product', 'Dramatic studio spotlight, floating hardware display, and glowing mint product highlights.', array['#0B0D14','#161B26','#34D399','#EEF0F5']::text[]),
  ('Warm Craft & Story', 'Rich, cozy atmosphere with classic serif headlines—ideal for coffee brands, makers, and studios.', array['#241811','#120C08','#C87D55','#F5EFE6']::text[]),
  ('Acid Agency Poster', 'High-energy poster typography with playful tape corners and sticker badges that stand out.', array['#06210C','#A3FF12','#F5F2E8','#111111']::text[]),
  ('Cosmic AI Platform', 'Luminous violet gradients, floating 3D geometric prism, and modern metric badges.', array['#090514','#261447','#A855F7','#FFFFFF']::text[]),
  ('Monochrome Editorial', 'Timeless black-and-white gallery feel designed for creators, consultants, and personal brands.', array['#09090B','#27272A','#F4F4F5','#9CA3AF']::text[]),
  ('Industrial Grid V.01', 'Structured Swiss brutalist grid with oversized index numbers and crisp monospace details.', array['#76756D','#161614','#E4E2DA','#111111']::text[]),
  ('Sticker Pop Studio', 'Bright dotted canvas with neo-brutalist outlines, tilted color stickers, and playful energy.', array['#F4F6FB','#1D4ED8','#FF4D2E','#0F172A']::text[]),
  ('Kinetic Split Gallery', 'Asymmetrical split-screen layout with a vertical project rail and dramatic focal stage.', array['#F4F3EE','#111111','#DC2626','#991B1B']::text[]),
  ('Soft Botanical Store', 'Gentle blush and sage boutique storefront with arched imagery and clean shopping badges.', array['#FDF4F5','#E8A5B5','#486856','#2B2124']::text[]),
  ('Bento Dashboard SaaS', 'Precision dark grid with live Bento UI widgets, mini sparkline charts, and product polish.', array['#0B0E14','#151A24','#38BDF8','#F4F4F5']::text[]),
  ('Luxury Travertine', 'Warm stone and gold hairline framing crafted for hospitality, real estate, and boutique brands.', array['#F6F1E7','#1F1B16','#B68A45','#D9CFC0']::text[])
) as s(title, description, palette)
where not exists (
  select 1 from public.style_cards existing
  where existing.workspace_id = w.id and existing.title = s.title
);

-- Save everything in one transaction. This function is SECURITY DEFINER only
-- because the client must update onboarding_completed_at on their own client
-- row; the auth.uid() ownership check is therefore mandatory.
create or replace function public.save_client_onboarding(
  p_client_id uuid,
  p_project_type text,
  p_goal text,
  p_palette_name text,
  p_palette_colors jsonb,
  p_timeline text,
  p_extra_notes text,
  p_requirements text[],
  p_style_picks jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_completed timestamptz;
  v_req text;
  v_pick jsonb;
  v_style_id uuid;
  v_kind text;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select workspace_id, onboarding_completed_at
    into v_workspace_id, v_completed
  from public.clients
  where id = p_client_id and user_id = auth.uid();

  if not found then
    raise exception 'not_allowed';
  end if;
  if v_completed is not null then
    raise exception 'onboarding_already_completed';
  end if;

  if p_project_type not in ('landing_page','business_site','portfolio','ecommerce') then
    raise exception 'invalid_project_type';
  end if;
  if nullif(btrim(p_goal), '') is null or length(p_goal) > 120 then
    raise exception 'invalid_project_goal';
  end if;
  if nullif(btrim(p_palette_name), '') is null
     or jsonb_typeof(coalesce(p_palette_colors, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_palette';
  end if;
  if p_timeline is not null and p_timeline not in ('ASAP (1–2 weeks)','This month','In 1–2 months','No rush') then
    raise exception 'invalid_timeline';
  end if;
  if length(coalesce(p_extra_notes, '')) > 3000 then
    raise exception 'notes_too_long';
  end if;
  if coalesce(array_length(p_requirements, 1), 0) > 50 then
    raise exception 'too_many_requirements';
  end if;
  if jsonb_typeof(coalesce(p_style_picks, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_style_picks';
  end if;
  if jsonb_array_length(coalesce(p_style_picks, '[]'::jsonb)) > 12 then
    raise exception 'too_many_style_picks';
  end if;

  insert into public.client_briefs (
    client_id, workspace_id, project_type, goal, palette_name,
    palette_colors, timeline, extra_notes, updated_at
  ) values (
    p_client_id, v_workspace_id, p_project_type, btrim(p_goal), btrim(p_palette_name),
    coalesce(p_palette_colors, '[]'::jsonb), nullif(p_timeline, ''),
    nullif(btrim(coalesce(p_extra_notes, '')), ''), now()
  )
  on conflict (client_id) do update set
    project_type = excluded.project_type,
    goal = excluded.goal,
    palette_name = excluded.palette_name,
    palette_colors = excluded.palette_colors,
    timeline = excluded.timeline,
    extra_notes = excluded.extra_notes,
    updated_at = now();

  delete from public.requirements
  where client_id = p_client_id and is_onboarding = true;

  for v_req in
    select distinct btrim(value)
    from unnest(coalesce(p_requirements, array[]::text[])) as req(value)
    where btrim(value) <> '' and length(btrim(value)) <= 200
  loop
    insert into public.requirements (client_id, workspace_id, body, is_onboarding)
    values (p_client_id, v_workspace_id, v_req, true);
  end loop;

  delete from public.style_picks where client_id = p_client_id;

  for v_pick in select value from jsonb_array_elements(coalesce(p_style_picks, '[]'::jsonb)) as p(value)
  loop
    v_style_id := nullif(v_pick->>'style_card_id', '')::uuid;
    v_kind := v_pick->>'kind';
    v_note := left(coalesce(v_pick->>'note', ''), 600);

    if v_kind not in ('like','favorite','dislike') then
      raise exception 'invalid_style_pick';
    end if;
    if not exists (
      select 1 from public.style_cards
      where id = v_style_id and workspace_id = v_workspace_id
    ) then
      raise exception 'invalid_style_card';
    end if;

    insert into public.style_picks (client_id, workspace_id, style_card_id, kind, note)
    values (p_client_id, v_workspace_id, v_style_id, v_kind, nullif(btrim(v_note), ''));
  end loop;

  update public.clients
  set onboarding_completed_at = now()
  where id = p_client_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.save_client_onboarding(uuid,text,text,text,jsonb,text,text,text[],jsonb)
  from public, anon;
grant execute on function public.save_client_onboarding(uuid,text,text,text,jsonb,text,text,text[],jsonb)
  to authenticated;

COMMIT;
