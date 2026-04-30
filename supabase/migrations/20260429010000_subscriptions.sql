-- Flare+ subscriptions (PR #1: premium gating primitive)
-- Minimal table; integrate with RevenueCat / Stripe webhooks later.
--
-- Timestamp bumped from the original handoff's 20260429000000 to avoid
-- colliding with the tier1_milestone_additions migration applied earlier
-- on the same day.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus')),
  status text not null default 'inactive'
    check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  provider text check (provider in ('stripe', 'revenuecat', 'apple', 'google')),
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Writes only via service role (webhooks).
-- No insert/update/delete policy for end-users.

create or replace function public.handle_new_user_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, tier, status)
  values (new.id, 'free', 'inactive')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

insert into public.subscriptions (user_id, tier, status)
select id, 'free', 'inactive' from auth.users
on conflict (user_id) do nothing;
