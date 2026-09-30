-- Free tier gets one additional user (founder-approved 2026-09-30).
--
-- Supersedes the Aug 2026 decision in 20260828100000_partner_seats_flare_plus.sql
-- (which gave the free tier zero additional users and auto-suspended EVERY
-- partner the moment Flare+ lapsed).
--
-- Product decision (2026-09-30):
--   * Free tier: 1 additional user (the owner + 1, typically the co-parent).
--   * Flare+:    2 additional users (unchanged).
--   * On lapse (Flare+ -> free): the LONGEST-STANDING partner keeps access
--     automatically; anyone beyond the free entitlement is suspended at the RLS
--     layer until renewal. Nothing is deleted — rows keep their role, label and
--     consent stamp, so renewal restores access exactly.
--   * Owner pause / un-pause is unchanged, and a paused partner still occupies
--     a seat (so it also still holds its place in the seniority order below).
--
-- DEPENDS ON 20260828100000_partner_seats_flare_plus.sql (partner_access.paused_at,
-- owner_has_plus, partner_seats_used, set_partner_access_paused, the two seat
-- triggers). Apply that one first, immediately followed by this one.
--
-- The entitlement rule lives in ONE place — partner_within_entitlement() —
-- and every RLS helper that grants a partner access calls it:
--   has_partner_access, partner_can_write, can_access_child, can_write_child.
--
-- can_write_child (20260820000000_child_pivot_log_rls.sql) was NOT touched by
-- 20260828100000, so under the Aug design a lapsed partner kept INSERT/UPDATE/
-- DELETE on every child-pivoted log table while losing read access. It is
-- brought under the same rule here so reads and writes suspend together.
--
-- Seniority column: partner_access.created_at (tie-break id). The row is
-- inserted by accept_partner_invitation at the moment of acceptance, so it IS
-- the "accepted at" time; there is no separate accepted_at column, and
-- consent_acknowledged_at is backfilled from created_at for pre-2026-05 rows
-- (20260507020000) so it is no better. Known edge: a partner who is revoked and
-- later re-invited keeps their ORIGINAL created_at (the accept RPC's ON CONFLICT
-- branch reactivates the old row), so they rank by their first acceptance.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS / DROP TRIGGER IF EXISTS only.

-- ---------------------------------------------------------------------------
-- 1. Index for the seniority lookup
-- ---------------------------------------------------------------------------
-- partner_within_entitlement() runs inside RLS on every child-data row a
-- partner reads. It scans the owner's active/paused rows in created_at order;
-- this index serves that as an ordered range scan. (The Aug index on
-- (owner_id, status) is a prefix of this one and is left in place.)
CREATE INDEX IF NOT EXISTS partner_access_owner_status_created_idx
  ON public.partner_access (owner_id, status, created_at, id);

-- ---------------------------------------------------------------------------
-- 2. Seat limit: free 1, Flare+ 2
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_seat_limit(_owner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.owner_has_plus(_owner_id) THEN 2 ELSE 1 END;
$$;

COMMENT ON FUNCTION public.partner_seat_limit(uuid) IS
  'How many additional users this owner may have. Free: 1 (typically the '
  'co-parent). Flare+: 2 (the 2nd and 3rd person on the account). Decision '
  '2026-09-30, supersedes 20260828100000.';

-- ---------------------------------------------------------------------------
-- 3. The entitlement rule (single source of truth)
-- ---------------------------------------------------------------------------
-- A partner is entitled when their partner_access row is 'active' AND its
-- seniority among the owner's seat-occupying rows ('active' + 'paused',
-- oldest first by created_at, then id) is within partner_seat_limit(owner).
--
-- Paused rows are ranked because a paused seat is still a seat: on a free
-- account, pausing the oldest partner does NOT promote the second one.
-- Pending invitations are not ranked — they grant no access.
--
-- Not guarded by `_user_id = auth.uid()`: it is not callable by anon /
-- authenticated (see grants below) and is only reached from inside the
-- SECURITY DEFINER helpers, which carry their own guards. service_role gets
-- EXECUTE so check-notifications can apply the same rule to push fan-out.
CREATE OR REPLACE FUNCTION public.partner_within_entitlement(_owner_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT pa.partner_id,
             pa.status,
             row_number() OVER (ORDER BY pa.created_at, pa.id) AS seat_rank
      FROM public.partner_access pa
      WHERE pa.owner_id = _owner_id
        AND pa.status IN ('active', 'paused')
    ) ranked
    WHERE ranked.partner_id = _user_id
      AND ranked.status = 'active'
      AND ranked.seat_rank <= public.partner_seat_limit(_owner_id)
  );
$$;

COMMENT ON FUNCTION public.partner_within_entitlement(uuid, uuid) IS
  'True when _user_id holds an ACTIVE partner_access row for _owner_id whose '
  'seniority (created_at, id; among active + paused rows) is within '
  'partner_seat_limit(_owner_id). The single definition of "this partner '
  'currently has access" — every partner RLS helper calls it. On a Flare+ '
  'lapse the longest-standing partner keeps access; the rest are suspended '
  'until renewal. Nothing is deleted.';

-- Supabase grants EXECUTE on new public functions to anon / authenticated
-- directly (not just via PUBLIC), so revoking from PUBLIC alone would leave
-- this callable over PostgREST. Revoke from all three.
REVOKE EXECUTE ON FUNCTION public.partner_within_entitlement(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_within_entitlement(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_within_entitlement(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.partner_within_entitlement(uuid, uuid) TO service_role;

-- Same reasoning for the Aug seat helper re-created above: 20260828100000 only
-- revoked from PUBLIC, which does not remove Supabase's direct anon /
-- authenticated grants. No client code calls it (the client derives seat math
-- from usePremium + its own partner_access rows).
REVOKE EXECUTE ON FUNCTION public.partner_seat_limit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_seat_limit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_seat_limit(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS helpers — swap the Flare+ check for the entitlement check
-- ---------------------------------------------------------------------------
-- Replaces the 20260828100000 definitions of has_partner_access,
-- partner_can_write and can_access_child, and the 20260820000000 definition of
-- can_write_child. Signatures, guards and role sets are unchanged.

CREATE OR REPLACE FUNCTION public.has_partner_access(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND public.partner_within_entitlement(_owner_id, _user_id);
$$;

COMMENT ON FUNCTION public.has_partner_access(uuid, uuid) IS
  'Partner read access. Requires an active partner_access row that is within '
  'the owner''s seat entitlement (free 1, Flare+ 2; seniority by created_at) — '
  'see partner_within_entitlement(). A Flare+ lapse keeps the longest-standing '
  'partner and suspends the rest without deleting anything.';

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
      EXISTS (
        SELECT 1 FROM public.partner_access
        WHERE partner_id = auth.uid()
          AND owner_id = _owner_id
          AND status = 'active'
          AND role IN ('coparent', 'caregiver')
      )
      AND public.partner_within_entitlement(_owner_id, auth.uid())
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
      AND public.partner_within_entitlement(c.parent_id, _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_child(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE id = _child_id AND parent_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.partner_access pa ON pa.owner_id = c.parent_id
      WHERE c.id = _child_id
        AND pa.partner_id = _user_id
        AND pa.status = 'active'
        AND pa.role IN ('coparent', 'caregiver')
        AND public.partner_within_entitlement(c.parent_id, _user_id)
    )
  )
$$;

COMMENT ON FUNCTION public.can_write_child(uuid, uuid) IS
  'True when _user_id owns _child_id, or holds an active write-capable '
  'partner_access row (coparent | caregiver, never viewer) to that child''s '
  'owner that is within the owner''s seat entitlement '
  '(partner_within_entitlement). Write-side counterpart to can_access_child(). '
  'Role set mirrors partner_can_write(); keep the two in sync. Guarded by '
  '_user_id = auth.uid() so it cannot be used to probe another user''s access.';

-- ---------------------------------------------------------------------------
-- 5. Seat enforcement triggers — no Flare+ gate, count only
-- ---------------------------------------------------------------------------
-- Transition rules are identical to 20260828100000: revoke always allowed;
-- active <-> paused never re-checked; only a row newly entering a seat-occupying
-- status (INSERT, or UPDATE from revoked) is counted.

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

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  -- The count excludes this row either way: BEFORE INSERT means it doesn't
  -- exist yet, and the only UPDATEs reaching here came from a non-occupying
  -- status (revoked).
  IF _used >= _limit THEN
    IF public.owner_has_plus(NEW.owner_id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: the free plan includes 1 additional user; Flare+ includes 2'
        USING ERRCODE = 'check_violation';
    END IF;
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

  SELECT public.partner_seats_used(NEW.owner_id) INTO _used;
  SELECT public.partner_seat_limit(NEW.owner_id) INTO _limit;

  IF _used >= _limit THEN
    IF public.owner_has_plus(NEW.owner_id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Flare+ includes % additional users', _limit
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: the free plan includes 1 additional user; Flare+ includes 2'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invite_seat_limit ON public.partner_invitations;
CREATE TRIGGER enforce_invite_seat_limit
  BEFORE INSERT ON public.partner_invitations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_seat_limit();

-- ---------------------------------------------------------------------------
-- 6. accept_partner_invitation — owner-must-have-Plus check removed
-- ---------------------------------------------------------------------------
-- Identical to the 20260828100000 body except the FLARE_PLUS_REQUIRED block is
-- gone; seat enforcement still happens in enforce_partner_seat_limit on the
-- partner_access INSERT / reactivation. The consent_acknowledged_at stamping
-- (COPPA / partner-invitee consent, 20260507020000) is unchanged.
--
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

COMMENT ON COLUMN public.partner_access.status IS
  'active | paused | revoked. active and paused both occupy a seat (free 1, '
  'Flare+ 2) and hold their seniority; revoked frees one. Only active rows '
  'within the entitlement resolve as having access.';
