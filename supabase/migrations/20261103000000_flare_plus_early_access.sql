-- Flare+ free early access for the v1 App Store launch.
--
-- Why: founder decision (2026-11-03). v1 ships with no purchase flow (IAP
-- arrives in v1.1), so every account gets Flare+ for free. Every premium check
-- (usePremium, owner_has_plus / child_owner_is_premium / partner_seat_limit,
-- and the chat / generate-activity-plan / generate-sign-plan /
-- generate-speech-class / visit-prep-questions / mcp edge functions) reads
-- public.subscriptions for tier = 'plus' AND status IN ('active','trialing').
-- We change the data, not those checks.
--
-- What this does:
--   1. Allows provider = 'early_access' so these grants can be found later.
--   2. handle_new_user_subscription() gives new signups the same row (done
--      first, so a signup that lands mid-migration isn't missed).
--   3. Gives every existing account tier 'plus', status 'active', provider
--      'early_access', current_period_start = now(), current_period_end NULL.
--      NULL period end is safe: no DB function, edge function or client gate
--      reads current_period_end (checked 2026-11-03); usePremium maps it to
--      periodEndsAt = null and nothing renders that.
--      Rows left alone:
--        - any row with a real billing provider (stripe/revenuecat/apple/google),
--          whatever its status (none exist on live as of 2026-11-03);
--        - rows that are already Flare+ (tier 'plus', active/trialing) with no
--          provider. These are the hand-granted comps from 20260503000000 and
--          20260824000000; tagging them 'early_access' would let v1.1's
--          reversal take away a comp it wasn't meant to touch.
--
-- Partner notifications: the subscriptions_notify_partners trigger
-- (20261006020000) tells partners "your shared access is back on" when an
-- owner's plan flips to Flare+. A bulk grant is not news to anyone, so the
-- trigger is disabled for the bulk statement only and re-enabled below. The
-- migrate job runs this file inside one transaction (BEGIN ... COMMIT), so a
-- failure rolls back the DISABLE too; the final assertion fails the migration
-- if the trigger isn't enabled again. No other triggers exist on
-- subscriptions. New signups fire the trigger on INSERT, but a brand-new
-- account has no partners, so it inserts nothing.
-- Effect on live: partners in seats 2-4 under a free owner come off hold
-- silently (there are none today; all 3 partner rows belong to Flare+ owners).
--
-- How v1.1 reverses it: restore the free default in
-- handle_new_user_subscription(), then downgrade only the grants made here:
--   UPDATE public.subscriptions
--      SET tier = 'free', status = 'inactive', provider = NULL,
--          current_period_start = NULL, current_period_end = NULL,
--          updated_at = now()
--    WHERE provider = 'early_access';
-- (skipping anyone who bought in the meantime, since IAP will set its own
-- provider). That UPDATE WILL fire subscriptions_notify_partners for owners
-- whose partners drop off hold, which is probably wanted then; decide in v1.1.
--
-- Idempotent: the constraint is dropped and re-added by name, the grant only
-- touches rows that are not yet Flare+ and have no provider, and the function
-- is CREATE OR REPLACE. A re-run changes nothing.

-- 1. Allow provider = 'early_access'. The original inline check is
--    auto-named subscriptions_provider_check; re-add with an explicit name.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_check;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_v2_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_v2_check
  CHECK (provider IN ('stripe', 'revenuecat', 'apple', 'google', 'early_access'));

COMMENT ON COLUMN public.subscriptions.provider IS
  'Billing source. early_access = free Flare+ granted to every v1 account (20261103000000); v1.1 downgrades WHERE provider = ''early_access''. NULL on a plus row = hand-granted comp.';

-- 2. New signups get the same early-access row. Done before the bulk grant
--    so a signup that commits mid-migration still ends up on Flare+.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- v1 free early access (20261103000000). v1.1: change back to
  -- ('free', 'inactive', NULL) when IAP ships.
  INSERT INTO public.subscriptions
    (user_id, tier, status, provider, current_period_start, current_period_end)
  VALUES (NEW.id, 'plus', 'active', 'early_access', now(), NULL)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Grant early access to every existing account, without partner notifications.
ALTER TABLE public.subscriptions DISABLE TRIGGER subscriptions_notify_partners;

INSERT INTO public.subscriptions
  (user_id, tier, status, provider, current_period_start, current_period_end)
SELECT u.id, 'plus', 'active', 'early_access', now(), NULL
FROM auth.users u
ON CONFLICT (user_id) DO UPDATE
  SET tier = 'plus',
      status = 'active',
      provider = 'early_access',
      current_period_start = now(),
      current_period_end = NULL,
      updated_at = now()
  WHERE public.subscriptions.provider IS NULL
    AND NOT (public.subscriptions.tier = 'plus'
             AND public.subscriptions.status IN ('active', 'trialing'));

ALTER TABLE public.subscriptions ENABLE TRIGGER subscriptions_notify_partners;

-- 4. Assertions: fail the migration (and roll it all back) rather than
--    leave the trigger off or an account without Flare+.
DO $$
DECLARE
  _enabled "char";
  _missing integer;
BEGIN
  SELECT tgenabled INTO _enabled
  FROM pg_trigger
  WHERE tgrelid = 'public.subscriptions'::regclass
    AND tgname = 'subscriptions_notify_partners';
  IF _enabled IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION 'subscriptions_notify_partners is not enabled (tgenabled=%)', _enabled;
  END IF;

  -- Lapsed rows on a real billing provider are deliberately left alone.
  SELECT count(*) INTO _missing
  FROM auth.users u
  LEFT JOIN public.subscriptions s ON s.user_id = u.id
  WHERE (s.user_id IS NULL
         OR NOT (s.tier = 'plus' AND s.status IN ('active', 'trialing')))
    AND coalesce(s.provider, '') NOT IN ('stripe', 'revenuecat', 'apple', 'google');
  IF _missing > 0 THEN
    RAISE EXCEPTION '% account(s) still without Flare+ after the early-access grant', _missing;
  END IF;
END;
$$;
