-- Flare+ gets 4 additional users (founder-approved 2026-10-16).
--
-- Was 2 (20260930100000_free_partner_seat.sql). A coparent takes a seat, so 2
-- left a two-parent family room for only one caregiver. 4 covers a coparent
-- plus up to three caregivers (e.g. two grandparents and a nanny).
-- Free tier is unchanged at 1.
--
-- Only partner_seat_limit() and the two trigger messages change. The
-- entitlement rule (partner_within_entitlement) reads partner_seat_limit(), so
-- seat enforcement, RLS access and the lapse-to-free seniority rule all pick up
-- the new number without further edits. Client mirror:
-- MAX_ADDITIONAL_USERS in src/lib/partnerInvite.ts.
--
-- Function bodies are otherwise identical to 20260930100000. CREATE OR REPLACE
-- keeps the existing EXECUTE grants, so the lock-down from that migration
-- still holds (asserted at the end). Idempotent.

CREATE OR REPLACE FUNCTION public.partner_seat_limit(_owner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.owner_has_plus(_owner_id) THEN 4 ELSE 1 END;
$$;

COMMENT ON FUNCTION public.partner_seat_limit(uuid) IS
  'How many additional users this owner may have. Free: 1 (typically the '
  'co-parent). Flare+: 4 (a co-parent plus up to three caregivers). Decision '
  '2026-10-16, supersedes the Flare+ value in 20260930100000.';

CREATE OR REPLACE FUNCTION public.enforce_partner_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used integer;
  _limit integer;
BEGIN
  IF NEW.status NOT IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  IF _used >= _limit THEN
    IF public.owner_has_plus(NEW.owner_id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: the free plan includes 1 additional user; Flare+ includes 4'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invite_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used integer;
  _limit integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  IF _used >= _limit THEN
    IF public.owner_has_plus(NEW.owner_id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: the free plan includes 1 additional user; Flare+ includes 4'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE _fn regprocedure;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.partner_seat_limit(uuid)'::regprocedure,
    'public.enforce_partner_seat_limit()'::regprocedure,
    'public.enforce_invite_seat_limit()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE')
       OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'flare_plus_four_seats: % is executable by a client role', _fn;
    END IF;
  END LOOP;
END
$$;
