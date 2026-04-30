-- Cry analysis history + feature snapshots.
-- Lets us:
--   1) show "patterns over time" charts later
--   2) feed weekly insights ("Maya's evening cries are usually hunger")
--   3) eventually train a real model on opt-in user data
--
-- Adapted from the handoff to match this repo:
--   - Renamed `logged_by` → `parent_id` for consistency with feeding_logs/etc.
--   - RLS uses `parent_id = auth.uid() OR has_partner_access(...)` instead of
--     a `caregivers` table (which doesn't exist in this schema).
--   - Timestamp bumped from 20260429020000 (collided with log_source migration).

create table if not exists public.cry_analyses (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid not null references public.profiles(id),
  bucket text not null check (bucket in ('hunger', 'discomfort', 'tired', 'pain', 'gas', 'unknown')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  features jsonb not null default '{}'::jsonb,
  user_correction text check (user_correction in ('hunger', 'discomfort', 'tired', 'pain', 'gas', 'unknown')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cry_analyses_child_occurred_idx
  on public.cry_analyses(child_id, occurred_at desc);

alter table public.cry_analyses enable row level security;

create policy "Parents can manage own cry analyses" on public.cry_analyses
  for all
  using (auth.uid() = parent_id or public.has_partner_access(auth.uid(), parent_id))
  with check (auth.uid() = parent_id or public.has_partner_access(auth.uid(), parent_id));
