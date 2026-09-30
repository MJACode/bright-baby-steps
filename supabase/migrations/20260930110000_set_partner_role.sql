-- Owner-only role change for an additional user (founder-approved 2026-09-30).
--
-- The owner can move a partner between coparent / caregiver / viewer without
-- revoking and re-inviting them. Same shape as set_partner_access_paused
-- (20260828100000): SECURITY DEFINER, pinned search_path, scoped by
-- owner_id = auth.uid(), only rows that currently hold a seat (active | paused).
--
-- Role is validated against the public.partner_role enum (20260429050000:
-- 'coparent' | 'caregiver' | 'viewer') rather than a hardcoded list, so the RPC
-- can't drift from the column type if the enum ever grows. An unknown role
-- raises the machine-readable INVALID_ROLE: prefix instead of the raw enum
-- cast error.
--
-- What this does NOT touch:
--   * status, paused_at, created_at (seat seniority), consent_acknowledged_at.
--     A role change is not a re-acceptance; the consent stamp stays as-is.
--   * Seat accounting. The enforce_partner_seat_limit trigger fires on this
--     UPDATE but returns immediately because OLD.status is active/paused.
--   * Access itself: has_partner_access / can_access_child still resolve by
--     entitlement, and the write helpers (partner_can_write, can_write_child)
--     read the new role on the very next statement — demoting to viewer
--     removes write access immediately.
--
-- Note: the pre-existing "Owners can update partner access" UPDATE policy
-- (USING auth.uid() = owner_id, WITH CHECK defaulting to USING) already lets an
-- owner change role via a direct table UPDATE. This RPC is the validated,
-- documented path the client uses; it does not widen anything.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT.

CREATE OR REPLACE FUNCTION public.set_partner_role(_partner_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _role IS NULL OR NOT (_role = ANY (enum_range(NULL::public.partner_role)::text[])) THEN
    RAISE EXCEPTION 'INVALID_ROLE: role must be one of coparent, caregiver, viewer'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.partner_access
  SET role = _role::public.partner_role
  WHERE owner_id = auth.uid()
    AND partner_id = _partner_id
    AND status IN ('active', 'paused');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active partner to update';
  END IF;
END;
$$;

-- Owner-only by body (owner_id = auth.uid()); anon has no auth.uid() and would
-- always hit NOT FOUND, but there is no reason to expose it at all. PUBLIC and
-- anon are both revoked because this project's pg_default_acl grants EXECUTE to
-- anon directly (see 20260930090000). Asserted below.
REVOKE EXECUTE ON FUNCTION public.set_partner_role(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_partner_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_partner_role(uuid, text) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.set_partner_role(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'set_partner_role: still executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_partner_role(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'set_partner_role: not executable by authenticated';
  END IF;
END
$$;

COMMENT ON FUNCTION public.set_partner_role(uuid, text) IS
  'Owner-only role change for an additional user (coparent | caregiver | '
  'viewer). Applies to active and paused rows; leaves status, seat seniority '
  'and the consent stamp untouched. Raises INVALID_ROLE: for an unknown role '
  'and ''No active partner to update'' when the caller does not own a '
  'seat-holding row for that partner.';
