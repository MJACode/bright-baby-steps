-- Caregiver seats: log only, or log + sleep & feed coach (founder-approved 2026-10-16).
--
-- Version 20261016100000 sorts after 20261016000000_flare_plus_four_seats.sql.
-- No transaction control: the CI migrate job wraps the file in BEGIN/COMMIT,
-- so any RAISE EXCEPTION rolls the whole file back.
--
-- NEEDS OWNER APPROVAL BEFORE MERGE. Merging applies this file to production.
--
-- Why: the roles offered are now Co-parent and Caregiver. For a caregiver the
-- owner picks "Log only" (default) or "Log + sleep & feed coach". The coach is
-- client-side local math over logs a caregiver can already read through RLS,
-- so the flag is a UI entitlement, not an access change. The client honours it
-- only while the child's owner has Flare+ (useChildOwnerPremium); the stored
-- value is kept when Flare+ lapses and applies again on renewal.
--
-- What it does:
--   1. Adds caregiver_coach boolean NOT NULL DEFAULT false to partner_access
--      and to partner_invitations (the inviter's choice rides the invite).
--   2. Backfills caregiver_coach = true for existing caregiver seats and for
--      pending caregiver invitations, so nobody loses the coach. The backfill
--      runs only in the same execution that adds the column, so a re-run never
--      overwrites a value the owner has since changed.
--   3. accept_partner_invitation copies caregiver_coach from the invite on
--      insert and on re-accept (ON CONFLICT). Everything else is identical to
--      20261014120000 (consent required, consent stamp, seat trigger, etc.).
--   4. Stops new viewer rows: set_partner_role accepts only coparent |
--      caregiver (INVALID_ROLE: prefix kept), and CHECK (role <> 'viewer') on
--      both tables. Live had 0 viewer rows in either table on 2026-10-16, so
--      the constraints are added validated. The enum value itself is left in
--      place (dropping an enum value means rewriting the type).
--
-- Owner changes the flag later: no new RPC. The live UPDATE policy
-- "Owners can update partner access" (USING auth.uid() = owner_id; WITH CHECK
-- omitted, so Postgres reuses USING) already lets the owner update the column
-- directly. Partners cannot change it: partner_access has no other UPDATE
-- policy, so a partner's UPDATE matches zero rows. Invitations are covered by
-- "Owners can manage own invitations" (FOR ALL, owner only). Both verified on
-- live 2026-10-16.
--
-- What it does NOT change:
--   * RLS, access helpers, seat limits. A caregiver reads and writes exactly
--     what they did before.
--   * set_partner_role leaves caregiver_coach alone when the role changes. The
--     flag is only read for caregivers, so a co-parent carrying a stale value
--     is harmless, and it comes back if they are moved back to caregiver.
--   * Account deletion / export. These are new columns on existing tables:
--     _purge_user_data() already deletes partner_access and
--     partner_invitations rows, so no purge change is needed.
--
-- Idempotent: column add + backfill guarded by a catalog check, CHECKs guarded
-- by pg_constraint, CREATE OR REPLACE for both functions, REVOKE/GRANT.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1 + 2. Columns and one-time backfill.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.partner_access'::regclass
      AND attname = 'caregiver_coach' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.partner_access
      ADD COLUMN caregiver_coach boolean NOT NULL DEFAULT false;

    UPDATE public.partner_access
    SET caregiver_coach = true
    WHERE role = 'caregiver';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.partner_invitations'::regclass
      AND attname = 'caregiver_coach' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.partner_invitations
      ADD COLUMN caregiver_coach boolean NOT NULL DEFAULT false;

    UPDATE public.partner_invitations
    SET caregiver_coach = true
    WHERE role = 'caregiver' AND status = 'pending';
  END IF;
END
$$;

COMMENT ON COLUMN public.partner_access.caregiver_coach IS
  'Caregiver seat may use the sleep & feed coach (client-side, Flare+ owners '
  'only). Read only when role = caregiver. Owner-editable via the owner UPDATE '
  'policy. Added 2026-10-16.';

COMMENT ON COLUMN public.partner_invitations.caregiver_coach IS
  'Inviter''s coach choice for a caregiver invite; copied to '
  'partner_access.caregiver_coach by accept_partner_invitation. Added 2026-10-16.';

-- ---------------------------------------------------------------------------
-- 3. Carry the flag through acceptance. Body identical to 20261014120000
--    except the two caregiver_coach lines.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(_invite_code text, _consent boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _consent IS NOT TRUE THEN
    RAISE EXCEPTION 'CONSENT_REQUIRED: confirm you agree before accepting';
  END IF;

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

  INSERT INTO public.partner_access (owner_id, partner_id, status, role, label, consent_acknowledged_at, caregiver_coach)
  VALUES (_invite.owner_id, auth.uid(), 'active', _invite.role, _invite.invitee_label, now(), _invite.caregiver_coach)
  ON CONFLICT (owner_id, partner_id)
  DO UPDATE SET
    status = 'active',
    revoked_at = NULL,
    paused_at = NULL,
    role = EXCLUDED.role,
    label = COALESCE(EXCLUDED.label, public.partner_access.label),
    consent_acknowledged_at = now(),
    caregiver_coach = EXCLUDED.caregiver_coach;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_partner_invitation(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invitation(text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. No new viewer rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_partner_role(_partner_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- viewer is still an enum value but is no longer offered (2026-10-16).
  IF _role IS NULL OR _role NOT IN ('coparent', 'caregiver') THEN
    RAISE EXCEPTION 'INVALID_ROLE: role must be one of coparent, caregiver'
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

REVOKE EXECUTE ON FUNCTION public.set_partner_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_partner_role(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_partner_role(uuid, text) IS
  'Owner-only role change for an additional user (coparent | caregiver; '
  'viewer is no longer offered as of 2026-10-16). Applies to active and paused '
  'rows; leaves status, seat seniority, the consent stamp and caregiver_coach '
  'untouched. Raises INVALID_ROLE: for any other role and ''No active partner '
  'to update'' when the caller does not own a seat-holding row for that partner.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.partner_access'::regclass
      AND conname = 'partner_access_role_not_viewer_check'
  ) THEN
    ALTER TABLE public.partner_access
      ADD CONSTRAINT partner_access_role_not_viewer_check CHECK (role <> 'viewer');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.partner_invitations'::regclass
      AND conname = 'partner_invitations_role_not_viewer_check'
  ) THEN
    ALTER TABLE public.partner_invitations
      ADD CONSTRAINT partner_invitations_role_not_viewer_check CHECK (role <> 'viewer');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Assertions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _src text;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('partner_access', 'partner_invitations')
        AND column_name = 'caregiver_coach'
        AND data_type = 'boolean'
        AND is_nullable = 'NO'
        AND column_default = 'false') <> 2 THEN
    RAISE EXCEPTION 'caregiver_coach: column missing or wrong shape on one of the tables';
  END IF;

  SELECT prosrc INTO _src FROM pg_proc
  WHERE oid = 'public.accept_partner_invitation(text, boolean)'::regprocedure;
  IF position('_invite.caregiver_coach' IN _src) = 0
     OR position('caregiver_coach = EXCLUDED.caregiver_coach' IN _src) = 0 THEN
    RAISE EXCEPTION 'caregiver_coach: accept_partner_invitation does not copy the flag';
  END IF;
  IF position('CONSENT_REQUIRED' IN _src) = 0 THEN
    RAISE EXCEPTION 'caregiver_coach: accept_partner_invitation lost the consent requirement';
  END IF;

  SELECT prosrc INTO _src FROM pg_proc
  WHERE oid = 'public.set_partner_role(uuid, text)'::regprocedure;
  IF position('NOT IN (''coparent'', ''caregiver'')' IN _src) = 0
     OR position('enum_range' IN _src) > 0 THEN
    RAISE EXCEPTION 'caregiver_coach: set_partner_role still accepts viewer';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
      WHERE conname IN ('partner_access_role_not_viewer_check', 'partner_invitations_role_not_viewer_check')
        AND convalidated) <> 2 THEN
    RAISE EXCEPTION 'caregiver_coach: viewer CHECK constraints missing or not validated';
  END IF;

  -- Only the owner may UPDATE partner_access; a partner must not be able to
  -- flip their own flag.
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'partner_access'
               AND cmd IN ('UPDATE', 'ALL')
               AND (coalesce(qual, '') <> '(auth.uid() = owner_id)'
                    OR coalesce(with_check, '(auth.uid() = owner_id)') <> '(auth.uid() = owner_id)')) THEN
    RAISE EXCEPTION 'caregiver_coach: partner_access has an UPDATE policy that is not owner-only';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.accept_partner_invitation(text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_partner_invitation(text, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_partner_role(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_partner_role(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'caregiver_coach: function grants are wrong';
  END IF;
END
$$;
