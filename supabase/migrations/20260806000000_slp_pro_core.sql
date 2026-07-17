-- Grace Flare Pro (SLP product surface) — core schema.
--
-- New product tier 'pro' for licensed speech-language pathologists, alongside
-- the consumer 'plus' (Flare+) tier. Adds the SLP professional profile, the
-- SLP's client roster (data-minimized: first name / initials + age in months
-- ONLY — no DOB, no surname, no PHI beyond what the tool needs), per-client
-- goals, session-plan history, and shareable weekly home programs.
--
-- Account-deletion coverage (verified against
-- 20260507010000_audit_delete_user_account.sql and the canonical
-- 20260509000000 _purge_user_data() refactor): the purge helper enumerates
-- non-cascading tables explicitly for FK-ordering, then finishes with
-- `DELETE FROM auth.users WHERE id = _uid`. Every table below references
-- auth.users(id) ON DELETE CASCADE (directly via user_id/slp_id, or
-- transitively via client_id -> slp_clients -> auth.users), so that final
-- auth.users delete is what purges them. None of these tables reference
-- public.profiles, so the earlier `DELETE FROM public.profiles` step cannot
-- FK-violate either. Per lessons-backend 2026-05-24: do NOT redefine
-- delete_user_account() or add these tables to the enumerated purge list —
-- the cascade chain covers them, and redefining would revert to a stale
-- purge order.
--
-- Storage: no Storage buckets are touched by the Pro surface (plans are
-- jsonb), so no Storage cleanup additions are needed in the delete-account /
-- inactive-account-purge edge functions.

-- ── 1. Widen the subscriptions tier CHECK to admit 'pro'. ───────────────────
-- Original inline column CHECK in 20260429010000_subscriptions.sql was
-- auto-named subscriptions_tier_check by Postgres. Same drop-and-re-add
-- pattern as 20260517000000_widen_feeding_logs_check_constraints.sql;
-- idempotent as a pair (re-run drops then re-adds the identical constraint).
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('free', 'plus', 'pro'));

-- ── 2. slp_profiles — the professional profile, one per auth user. ──────────
create table if not exists public.slp_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  credentials text,                                  -- e.g. "MS, CCC-SLP"
  practice_name text,
  accepted_pro_terms_at timestamptz not null default now(),
  pro_terms_version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.slp_profiles is
  'Grace Flare Pro professional profile for a licensed SLP. One row per auth '
  'user (user_id PK). accepted_pro_terms_at / pro_terms_version record '
  'acceptance of the Pro terms. Cascade-deleted with auth.users, so '
  '_purge_user_data()''s final DELETE FROM auth.users covers it.';

alter table public.slp_profiles enable row level security;

drop policy if exists slp_profiles_select on public.slp_profiles;
create policy slp_profiles_select
  on public.slp_profiles for select
  using (auth.uid() = user_id);

drop policy if exists slp_profiles_insert on public.slp_profiles;
create policy slp_profiles_insert
  on public.slp_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists slp_profiles_update on public.slp_profiles;
create policy slp_profiles_update
  on public.slp_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy by design: the profile is removed by account deletion
-- (auth.users cascade), not by an in-app action.

-- ── 3. slp_clients — the SLP's client roster (data-minimized). ──────────────
create table if not exists public.slp_clients (
  id uuid primary key default gen_random_uuid(),
  slp_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  age_months int not null check (age_months between 0 and 216),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite-FK target for the child tables (slp_client_goals,
  -- slp_session_plans, slp_home_programs): their (client_id, slp_id) pairs
  -- reference (id, slp_id) here, so a child row can never pair another
  -- SLP's client with the caller's slp_id.
  constraint slp_clients_id_slp_id_key unique (id, slp_id)
);

comment on table public.slp_clients is
  'Grace Flare Pro client roster. Data minimization by design: display_name '
  'is first name or initials ONLY plus age in months — no DOB, no surname, '
  'no diagnosis codes. Cascade-deleted with auth.users.';
comment on column public.slp_clients.display_name is
  'First name or initials ONLY — data minimization by design. Never store '
  'full legal names here.';

create index if not exists idx_slp_clients_slp
  on public.slp_clients (slp_id);

alter table public.slp_clients enable row level security;

drop policy if exists slp_clients_select on public.slp_clients;
create policy slp_clients_select
  on public.slp_clients for select
  using (auth.uid() = slp_id);

drop policy if exists slp_clients_insert on public.slp_clients;
create policy slp_clients_insert
  on public.slp_clients for insert
  with check (auth.uid() = slp_id);

drop policy if exists slp_clients_update on public.slp_clients;
create policy slp_clients_update
  on public.slp_clients for update
  using (auth.uid() = slp_id)
  with check (auth.uid() = slp_id);

drop policy if exists slp_clients_delete on public.slp_clients;
create policy slp_clients_delete
  on public.slp_clients for delete
  using (auth.uid() = slp_id);

-- ── 4. slp_client_goals — therapy goals per client. ─────────────────────────
create table if not exists public.slp_client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  slp_id uuid not null references auth.users(id) on delete cascade,  -- denormalized for cheap RLS
  goal_text text not null check (char_length(goal_text) <= 1000),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  status text not null default 'active' check (status in ('active', 'met', 'archived')),
  created_at timestamptz not null default now(),

  -- Composite FK: binds the denormalized slp_id to the client's actual
  -- owner, so a row can never pair another SLP's client with your slp_id.
  constraint slp_client_goals_client_id_slp_id_fkey
    foreign key (client_id, slp_id)
    references public.slp_clients (id, slp_id) on delete cascade
);

comment on table public.slp_client_goals is
  'Therapy goals for an SLP''s client. slp_id is denormalized from '
  'slp_clients so RLS is a direct auth.uid() comparison (no join). '
  'Cascade-deleted with slp_clients and auth.users.';

create index if not exists idx_slp_client_goals_client
  on public.slp_client_goals (client_id);
create index if not exists idx_slp_client_goals_slp
  on public.slp_client_goals (slp_id);

alter table public.slp_client_goals enable row level security;

drop policy if exists slp_client_goals_select on public.slp_client_goals;
create policy slp_client_goals_select
  on public.slp_client_goals for select
  using (auth.uid() = slp_id);

drop policy if exists slp_client_goals_insert on public.slp_client_goals;
create policy slp_client_goals_insert
  on public.slp_client_goals for insert
  with check (auth.uid() = slp_id);

drop policy if exists slp_client_goals_update on public.slp_client_goals;
create policy slp_client_goals_update
  on public.slp_client_goals for update
  using (auth.uid() = slp_id)
  with check (auth.uid() = slp_id);

drop policy if exists slp_client_goals_delete on public.slp_client_goals;
create policy slp_client_goals_delete
  on public.slp_client_goals for delete
  using (auth.uid() = slp_id);

-- ── 5. slp_session_plans — AI-drafted session plans (history model). ────────
create table if not exists public.slp_session_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  slp_id uuid not null references auth.users(id) on delete cascade,
  plan jsonb not null,
  created_at timestamptz not null default now(),

  -- Composite FK: see slp_client_goals — prevents cross-SLP client pairing.
  constraint slp_session_plans_client_id_slp_id_fkey
    foreign key (client_id, slp_id)
    references public.slp_clients (id, slp_id) on delete cascade
);

comment on table public.slp_session_plans is
  'AI-drafted therapy session plans (pro-generate kind=session_plan). '
  'History model: many rows per client, newest first. Cascade-deleted with '
  'slp_clients and auth.users.';

create index if not exists idx_slp_session_plans_client
  on public.slp_session_plans (client_id);

alter table public.slp_session_plans enable row level security;

drop policy if exists slp_session_plans_select on public.slp_session_plans;
create policy slp_session_plans_select
  on public.slp_session_plans for select
  using (auth.uid() = slp_id);

drop policy if exists slp_session_plans_insert on public.slp_session_plans;
create policy slp_session_plans_insert
  on public.slp_session_plans for insert
  with check (auth.uid() = slp_id);

drop policy if exists slp_session_plans_update on public.slp_session_plans;
create policy slp_session_plans_update
  on public.slp_session_plans for update
  using (auth.uid() = slp_id)
  with check (auth.uid() = slp_id);

drop policy if exists slp_session_plans_delete on public.slp_session_plans;
create policy slp_session_plans_delete
  on public.slp_session_plans for delete
  using (auth.uid() = slp_id);

-- ── 6. slp_home_programs — shareable weekly home programs. ──────────────────
-- Families access these WITHOUT a Grace Flare account, via an unguessable
-- share_token (32 random bytes, hex — same entropy as
-- partner_invitations.invite_code). There are deliberately NO anon RLS
-- policies on this table: anonymous access is EXCLUSIVELY via the
-- SECURITY DEFINER RPCs get_home_program(_token) and
-- toggle_home_program_day(_token, _day) in 20260806010000, which expose only
-- the minimal fields and require token + status='active' + unexpired.
create table if not exists public.slp_home_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  slp_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  week_start date not null,
  plan jsonb not null,
  completed_days smallint[] not null default '{}',   -- day numbers checked off (1..7)
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite FK: see slp_client_goals — prevents cross-SLP client pairing.
  constraint slp_home_programs_client_id_slp_id_fkey
    foreign key (client_id, slp_id)
    references public.slp_clients (id, slp_id) on delete cascade
);

comment on table public.slp_home_programs is
  'Weekly home practice program an SLP shares with a family by link. '
  'share_token is the only credential (no family account); anon access goes '
  'exclusively through the SECURITY DEFINER RPCs get_home_program / '
  'toggle_home_program_day — this table has owner-only RLS and NO anon '
  'policies. Auto-expires 90 days after creation; the SLP can revoke early. '
  'Cascade-deleted with slp_clients and auth.users.';

-- share_token uniqueness (and its lookup index) comes free from the UNIQUE
-- constraint above; client_id needs its own index for roster views.
create index if not exists idx_slp_home_programs_client
  on public.slp_home_programs (client_id);

alter table public.slp_home_programs enable row level security;

drop policy if exists slp_home_programs_select on public.slp_home_programs;
create policy slp_home_programs_select
  on public.slp_home_programs for select
  using (auth.uid() = slp_id);

drop policy if exists slp_home_programs_insert on public.slp_home_programs;
create policy slp_home_programs_insert
  on public.slp_home_programs for insert
  with check (auth.uid() = slp_id);

drop policy if exists slp_home_programs_update on public.slp_home_programs;
create policy slp_home_programs_update
  on public.slp_home_programs for update
  using (auth.uid() = slp_id)
  with check (auth.uid() = slp_id);

drop policy if exists slp_home_programs_delete on public.slp_home_programs;
create policy slp_home_programs_delete
  on public.slp_home_programs for delete
  using (auth.uid() = slp_id);

-- ── 7. updated_at triggers. ─────────────────────────────────────────────────
-- Reuse the existing public.update_updated_at() helper (defined in
-- 20260322213259_*.sql). Don't redefine it.
drop trigger if exists update_slp_profiles_updated_at on public.slp_profiles;
create trigger update_slp_profiles_updated_at
  before update on public.slp_profiles
  for each row
  execute function public.update_updated_at();

drop trigger if exists update_slp_clients_updated_at on public.slp_clients;
create trigger update_slp_clients_updated_at
  before update on public.slp_clients
  for each row
  execute function public.update_updated_at();

drop trigger if exists update_slp_home_programs_updated_at on public.slp_home_programs;
create trigger update_slp_home_programs_updated_at
  before update on public.slp_home_programs
  for each row
  execute function public.update_updated_at();
