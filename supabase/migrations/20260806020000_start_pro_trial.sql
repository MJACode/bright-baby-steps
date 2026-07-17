-- Grace Flare Pro — self-serve 14-day trial RPC.
--
-- Called by the client after the SLP completes their professional profile.
-- SECURITY DEFINER because end-users have no INSERT/UPDATE RLS policy on
-- subscriptions (writes are otherwise service-role/webhook-only by design —
-- see 20260429010000_subscriptions.sql). This RPC is the single, narrow
-- exception: it can only move the CALLER's own row, and only along the
-- exact free -> pro-trial edge.
--
-- Guards, encoded in the UPDATE's WHERE clause:
--   tier = 'free'            -> never clobbers an active Flare+ ('plus') or
--                               existing 'pro' subscription.
--   trial_ends_at is null    -> one trial per account, ever. Any prior trial
--                               (Pro or Flare+) leaves trial_ends_at set, so
--                               the row no longer matches. When the 14 days
--                               lapse, status stays 'trialing' with a past
--                               trial_ends_at — entitlement checks (see
--                               pro-generate edge function) compare
--                               trial_ends_at to now(), since no billing
--                               webhook flips expired trials.
create or replace function public.start_pro_trial()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A professional profile (with Pro-terms acceptance stamped on it) is a
  -- prerequisite for the trial.
  if not exists (
    select 1 from public.slp_profiles where user_id = auth.uid()
  ) then
    raise exception 'pro_profile_required';
  end if;

  update public.subscriptions
  set tier = 'pro',
      status = 'trialing',
      trial_ends_at = now() + interval '14 days',
      updated_at = now()
  where user_id = auth.uid()
    and tier = 'free'
    and trial_ends_at is null;

  if not found then
    raise exception 'trial_unavailable';
  end if;
end;
$$;

-- Authenticated only — anon must never start trials. Revoke the Postgres
-- default PUBLIC execute grant so anon can't reach it either (same
-- belt-and-braces as _purge_user_data / purge_inactive_account).
revoke all on function public.start_pro_trial() from public, anon;
grant execute on function public.start_pro_trial() to authenticated;

comment on function public.start_pro_trial() is
  'Starts the caller''s one-time 14-day Grace Flare Pro trial. Requires an '
  'slp_profiles row (raises pro_profile_required) and a never-trialed free '
  'subscription row (raises trial_unavailable otherwise). SECURITY DEFINER '
  'because subscriptions has no end-user write policy.';
