-- Flare+ gating for additional users, plus an owner-controlled pause switch.
--
-- Product decision (Aug 2026):
--   * Free tier gets zero additional users — the owner only.
--   * Flare+ unlocks 2 additional seats (the 2nd and 3rd person on the account).
--   * When a Flare+ subscription lapses, additional users are auto-suspended at
--     the RLS layer. Nothing is deleted — access comes straight back on renewal.
--   * The owner can pause any additional user at any time and un-pause them
--     later. A paused seat still occupies a seat; "Remove" frees one.
--
-- Seat accounting is deliberately in one place (partner_seats_used) so the
-- invite path, the accept path and the un-pause path can't drift apart.

-- ---------------------------------------------------------------------------
-- 1. 'paused' status on partner_access
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_access
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.partner_access.paused_at IS
  'Set when the owner pauses this additional user. Reversible — the row keeps '
  'its role and consent stamp so un-pausing restores access exactly. NULL for '
  'active and revoked rows.';

COMMENT ON COLUMN public.partner_access.status IS
  'active | paused | revoked. active and paused both occupy a Flare+ seat; '
  'revoked frees one.';

CREATE INDEX IF NOT EXISTS partner_access_owner_status_idx
  ON public.partner_access (owner_id, status);

-- ---------------------------------------------------------------------------
-- 2. Subscription + seat helpers
-- ---------------------------------------------------------------------------

-- Mirrors the `isPremium` rule in src/hooks/usePremium.tsx. Keep the two in
-- sync: if one adds a status the other must too, or the UI and the RLS layer
-- will disagree about who can see what.
CREATE OR REPLACE FUNCTION public.owner_has_plus(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _owner_id
      AND tier = 'plus'
      AND status IN ('active', 'trialing')
  );
$$;

COMMENT ON FUNCTION public.owner_has_plus(uuid) IS
  'True when the user holds an active or trialing Flare+ subscription. '
  'Mirrors usePremium.isPremium — change both together.';

CREATE OR REPLACE FUNCTION public.partner_seat_limit(_owner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.owner_has_plus(_owner_id) THEN 2 ELSE 0 END;
$$;

COMMENT ON FUNCTION public.partner_seat_limit(uuid) IS
  'How many additional users this owner may have. Free: 0. Flare+: 2 '
  '(the 2nd and 3rd person on the account).';

-- A seat is occupied by an active partner, a paused partner, or an outstanding
-- invite. Pending invites count so an owner cannot mint five links and hand
-- them out; cancelling an invite frees the seat immediately.
CREATE OR REPLACE FUNCTION public.partner_seats_used(_owner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT count(*) FROM public.partner_access
      WHERE owner_id = _owner_id AND status IN ('active', 'paused'))
    +
    (SELECT count(*) FROM public.partner_invitations
      WHERE owner_id = _owner_id AND status = 'pending' AND expires_at > now())
  )::integer;
$$;

COMMENT ON FUNCTION public.partner_seats_used(uuid) IS
  'Seats consumed: active + paused partners, plus outstanding (pending, '
  'unexpired) invitations.';

-- These three take an arbitrary owner id, and Postgres grants EXECUTE to PUBLIC
-- by default. Left open, any signed-in user could probe a stranger's
-- subscription state or count their caregivers. Lock them down: the RLS
-- helpers below call them from inside SECURITY DEFINER bodies (evaluated as
-- the definer, so the grant doesn't matter there), and the client gets its
-- seat math from usePremium + its own partner_access rows.
REVOKE EXECUTE ON FUNCTION public.owner_has_plus(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_seat_limit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_seats_used(uuid) FROM PUBLIC;

-- check-notifications runs on the service role and needs the subscription
-- check to decide whether to fan a push out to an owner's partners.
GRANT EXECUTE ON FUNCTION public.owner_has_plus(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Access checks now require an active owner subscription
-- ---------------------------------------------------------------------------
-- This is the auto-suspend. Rows stay exactly as they are; the partner simply
-- stops resolving as having access until the owner is on Flare+ again.

CREATE OR REPLACE FUNCTION public.has_partner_access(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND public.owner_has_plus(_owner_id)
    AND EXISTS (
      SELECT 1 FROM public.partner_access
      WHERE partner_id = _user_id
        AND owner_id = _owner_id
        AND status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.partner_can_write(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = _owner_id
    OR (
      public.owner_has_plus(_owner_id)
      AND EXISTS (
        SELECT 1 FROM public.partner_access
        WHERE partner_id = auth.uid()
          AND owner_id = _owner_id
          AND status = 'active'
          AND role IN ('coparent', 'caregiver')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_child(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.children
    WHERE id = _child_id AND parent_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.children c
    JOIN public.partner_access pa ON pa.owner_id = c.parent_id
    WHERE c.id = _child_id
      AND pa.partner_id = _user_id
      AND pa.status = 'active'
      AND public.owner_has_plus(c.parent_id)
  );
$$;

COMMENT ON FUNCTION public.has_partner_access(uuid, uuid) IS
  'Partner read access. Requires an active partner_access row AND an active '
  'Flare+ subscription on the owner — a lapsed subscription auto-suspends '
  'every additional user without deleting anything.';

-- ---------------------------------------------------------------------------
-- 4. Seat enforcement triggers
-- ---------------------------------------------------------------------------
-- Both the invite path and the accept / un-pause path funnel through these, so
-- there is exactly one definition of "you're out of seats".

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
  -- Freeing a seat (revoke) is always allowed.
  IF NEW.status NOT IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  -- Already occupying a seat and not changing that? Nothing to check.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'paused') THEN
    RETURN NEW;
  END IF;

  IF NOT public.owner_has_plus(NEW.owner_id) THEN
    RAISE EXCEPTION 'FLARE_PLUS_REQUIRED: additional users need an active Flare+ subscription'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  -- The count excludes this row either way: BEFORE INSERT means it doesn't
  -- exist yet, and the only UPDATEs reaching here came from a non-occupying
  -- status (revoked).
  IF _used >= _limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_partner_seat_limit ON public.partner_access;
CREATE TRIGGER enforce_partner_seat_limit
  BEFORE INSERT OR UPDATE ON public.partner_access
  FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_seat_limit();

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

  IF NOT public.owner_has_plus(NEW.owner_id) THEN
    RAISE EXCEPTION 'FLARE_PLUS_REQUIRED: inviting someone needs an active Flare+ subscription'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  IF _used >= _limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_seat_limit ON public.partner_invitations;
CREATE TRIGGER enforce_invite_seat_limit
  BEFORE INSERT ON public.partner_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_seat_limit();

-- ---------------------------------------------------------------------------
-- 5. accept_partner_invitation — seat-aware, with invitee-facing errors
-- ---------------------------------------------------------------------------
-- The invitation is marked accepted BEFORE the partner_access insert so its own
-- pending seat isn't counted twice against the limit. Same transaction, so a
-- failed insert rolls the invitation back to pending.
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  SELECT * INTO _invite
  FROM public.partner_invitations
  WHERE invite_code = _invite_code
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  IF _invite.owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot accept your own invitation';
  END IF;

  IF NOT public.owner_has_plus(_invite.owner_id) THEN
    RAISE EXCEPTION 'FLARE_PLUS_REQUIRED: the person who invited you needs an active Flare+ subscription'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.partner_invitations
  SET status = 'accepted', accepted_by = auth.uid(), updated_at = now()
  WHERE id = _invite.id;

  INSERT INTO public.partner_access (owner_id, partner_id, status, role, label, consent_acknowledged_at)
  VALUES (_invite.owner_id, auth.uid(), 'active', _invite.role, _invite.invitee_label, now())
  ON CONFLICT (owner_id, partner_id)
  DO UPDATE SET
    status = 'active',
    revoked_at = NULL,
    paused_at = NULL,
    role = EXCLUDED.role,
    label = COALESCE(EXCLUDED.label, public.partner_access.label),
    consent_acknowledged_at = COALESCE(public.partner_access.consent_acknowledged_at, now());
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Owner-facing pause switch
-- ---------------------------------------------------------------------------
-- partner_access already has an owner UPDATE policy, but going through an RPC
-- keeps the status vocabulary and the paused_at bookkeeping in one place.
CREATE OR REPLACE FUNCTION public.set_partner_access_paused(_partner_id uuid, _paused boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.partner_access
  SET status = CASE WHEN _paused THEN 'paused' ELSE 'active' END,
      paused_at = CASE WHEN _paused THEN now() ELSE NULL END
  WHERE owner_id = auth.uid()
    AND partner_id = _partner_id
    AND status IN ('active', 'paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active partner to update';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_partner_access_paused(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_partner_access_paused(uuid, boolean) IS
  'Owner-only reversible shut-off for an additional user. Paused rows keep '
  'their seat, role and consent stamp so un-pausing restores access exactly.';
