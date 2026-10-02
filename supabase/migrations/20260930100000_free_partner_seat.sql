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
-- NOT guarded by `_user_id = auth.uid()` — it answers for any (owner, user)
-- pair — so it must never be directly callable by anon / authenticated.
-- The EXECUTE lock-down is in section 7 and asserted there.
--
-- Who reaches it:
--   * The four RLS helpers in section 4. Each pins the user argument to the
--     caller: has_partner_access, can_access_child and can_write_child via their
--     own `_user_id = auth.uid()` guard, partner_can_write by passing auth.uid()
--     directly. They are SECURITY DEFINER owned by postgres, so the inner call
--     is privilege-checked against postgres, not the end user — the revoke does
--     not break RLS.
--   * service_role directly: check-notifications filters push fan-out through
--     it so recipients match exactly who RLS lets open the child.
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

-- ---------------------------------------------------------------------------
-- 4. RLS helpers — swap the Flare+ check for the entitlement check
-- ---------------------------------------------------------------------------
-- Replaces the 20260828100000 definitions of has_partner_access,
-- partner_can_write and can_access_child, and the 20260820000000 definition of
-- can_write_child. Signatures and role sets are unchanged.
--
-- can_access_child gains the `_user_id = auth.uid()` guard that has_partner_access
-- and can_write_child already carry. Without it, any signed-in user could call
-- POST /rest/v1/rpc/can_access_child with someone else's uuid and learn whether
-- that person can see a given child. Safe for every existing caller: all 95
-- RLS policies on live that call has_partner_access / can_access_child /
-- can_write_child pass auth.uid() as the user argument (verified read-only
-- against pg_policies 2026-09-30), and no client, edge function or SQL
-- function calls can_access_child any other way.

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
        AND public.partner_within_entitlement(c.parent_id, _user_id)
    )
  )
$$;

COMMENT ON FUNCTION public.can_access_child(uuid, uuid) IS
  'True when _user_id owns _child_id, or holds an active partner_access row '
  '(any role) to that child''s owner that is within the owner''s seat '
  'entitlement (partner_within_entitlement). Guarded by _user_id = auth.uid() '
  'so it cannot be used to probe another user''s access.';

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

-- ---------------------------------------------------------------------------
-- 7. EXECUTE lock-down for every partner function (20260828100000 + this file)
-- ---------------------------------------------------------------------------
-- On this project pg_default_acl grants EXECUTE on every new public function
-- DIRECTLY to anon, authenticated and service_role, so REVOKE ... FROM PUBLIC
-- removes nothing (see 20260930090000_lock_down_admin_rpcs.sql). Three tiers:
--
--   internal   — take an arbitrary owner/user id with no auth.uid() guard, or
--                are trigger functions. anon + authenticated revoked.
--                service_role keeps EXECUTE only where an edge function calls
--                it (owner_has_plus, partner_within_entitlement); service_role
--                is never revoked (it is fully trusted and bypasses RLS anyway).
--   rls_helper — called by RLS policies that apply TO public (anon included).
--                KEEP anon + authenticated: a policy expression is
--                privilege-checked as the querying role, so revoking anon would
--                turn every anonymous read of children / log tables from "0 rows"
--                into "permission denied for function" (verified locally) — a
--                behaviour change for any pre-auth request, for no gain.
--                Each is guarded by auth.uid() (anon => NULL => no access), so
--                calling it directly over PostgREST reveals nothing.
--   client_rpc — owner/invitee RPCs the app calls with a session. Body requires
--                auth.uid(); no anon use case. anon revoked, authenticated kept.
--
-- Trigger functions do not need EXECUTE at fire time (only at CREATE TRIGGER),
-- so revoking them does not stop the seat triggers firing (tested).
--
-- set_partner_role is created and asserted in 20260930110000.
-- Idempotent: REVOKE/GRANT are no-ops on re-run. Hard assertion at the end.
DO $$
DECLARE
  _spec record;
  _fn regprocedure;
BEGIN
  FOR _spec IN
    SELECT * FROM (VALUES
      -- sig                                              tier          service_role must have EXECUTE
      ('public.owner_has_plus(uuid)',                        'internal',   true),
      ('public.partner_seat_limit(uuid)',                    'internal',   false),
      ('public.partner_seats_used(uuid)',                    'internal',   false),
      ('public.partner_within_entitlement(uuid, uuid)',      'internal',   true),
      ('public.enforce_partner_seat_limit()',                'internal',   false),
      ('public.enforce_invite_seat_limit()',                 'internal',   false),
      ('public.has_partner_access(uuid, uuid)',              'rls_helper', true),
      ('public.partner_can_write(uuid)',                     'rls_helper', true),
      ('public.can_access_child(uuid, uuid)',                'rls_helper', true),
      ('public.can_write_child(uuid, uuid)',                 'rls_helper', true),
      ('public.accept_partner_invitation(text)',             'client_rpc', true),
      ('public.set_partner_access_paused(uuid, boolean)',    'client_rpc', true)
    ) AS t(sig, tier, svc)
  LOOP
    _fn := to_regprocedure(_spec.sig);
    IF _fn IS NULL THEN
      RAISE EXCEPTION 'free_partner_seat: % missing — apply 20260828100000 first', _spec.sig;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', _fn);
    IF _spec.tier = 'internal' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', _fn);
    ELSIF _spec.tier = 'rls_helper' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', _fn);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', _fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _fn);
    END IF;
    IF _spec.svc THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _fn);
    END IF;

    -- Assertions
    IF has_function_privilege('anon', _fn, 'EXECUTE') <> (_spec.tier = 'rls_helper') THEN
      RAISE EXCEPTION 'free_partner_seat: anon EXECUTE on % is wrong for tier %', _spec.sig, _spec.tier;
    END IF;
    IF has_function_privilege('authenticated', _fn, 'EXECUTE') <> (_spec.tier <> 'internal') THEN
      RAISE EXCEPTION 'free_partner_seat: authenticated EXECUTE on % is wrong for tier %', _spec.sig, _spec.tier;
    END IF;
    IF _spec.svc AND NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'free_partner_seat: % is not executable by service_role', _spec.sig;
    END IF;
  END LOOP;
END
$$;
