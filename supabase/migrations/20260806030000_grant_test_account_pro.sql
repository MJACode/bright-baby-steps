-- Grant Grace Flare Pro to the test account matt.alksninis@gmail.com.
-- Mirrors 20260503000000_grant_test_account_premium.sql (which granted 'plus').
-- Idempotent: re-running this is a no-op if the user already has 'pro' / 'active'.
-- Safe if the user doesn't exist yet — the SELECT just returns no rows.
--
-- To revoke: update subscriptions set tier='free', status='inactive' where user_id = (select id from auth.users where email='matt.alksninis@gmail.com');

insert into public.subscriptions (user_id, tier, status, current_period_start, current_period_end, provider)
select
  id,
  'pro',
  'active',
  now(),
  now() + interval '100 years',
  null
from auth.users
where email = 'matt.alksninis@gmail.com'
on conflict (user_id) do update
  set tier = excluded.tier,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      updated_at = now();
