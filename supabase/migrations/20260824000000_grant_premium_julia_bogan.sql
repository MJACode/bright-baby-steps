-- Grant comped Flare+ to juliabogdan22@gmail.com at no cost (no payment/provider involved).
-- Idempotent: re-running this is a no-op if the user already has 'plus' / 'active'.
-- Safe if the user doesn't exist yet — the SELECT just returns no rows and nothing is inserted.
--
-- Uses lower(email) = lower(...) rather than an exact-string match because Postgres email
-- comparison is case-sensitive by default and the human-typed address casing is not guaranteed
-- to match what's stored in auth.users (Supabase/GoTrue typically stores emails lowercased on
-- signup, but this migration doesn't assume that — it matches case-insensitively instead).
--
-- To revoke: update public.subscriptions set tier='free', status='inactive'
--   where user_id = (select id from auth.users where lower(email) = lower('juliabogdan22@gmail.com'));

insert into public.subscriptions (user_id, tier, status, current_period_start, current_period_end, provider)
select
  id,
  'plus',
  'active',
  now(),
  now() + interval '100 years',
  null
from auth.users
where lower(email) = lower('juliabogdan22@gmail.com')
on conflict (user_id) do update
  set tier = excluded.tier,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      updated_at = now();
