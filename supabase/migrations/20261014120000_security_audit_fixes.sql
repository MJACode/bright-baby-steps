-- SECURITY: close the gaps found in the 2026-10-14 audit.
--
-- Version 20261014120000 sorts after 20261013000000_signup_consent_stamp.sql.
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER/POLICY IF EXISTS, REVOKE/GRANT,
-- and the token rewrite skips values that already start with 'sha256:'.
-- No transaction control: the CI migrate job wraps the file in BEGIN/COMMIT,
-- so any RAISE EXCEPTION rolls the whole file back.
--
-- NEEDS OWNER APPROVAL BEFORE MERGE. Merging applies this file to production.
--
-- What it does:
--   1. A caregiver or co-parent can no longer take ownership of a child by
--      updating children.parent_id, and can no longer insert a child row
--      owned by someone else.
--   2. A signed-in user can no longer write the COPPA / consent columns on
--      their own profile (vpc_*, inactive_purge_warned_at, data_consent_*,
--      email, id). Server paths (security definer, service_role) still can.
--   3. Existing vpc_second_token values are stored as sha256:<hex> so reading
--      the profile does not reveal a token that completes VPC. The RPC accepts
--      the hash and, until this rewrite, a leftover plaintext token.
--   4. accept_partner_invitation requires _consent = true. The one-argument
--      function is dropped so PostgREST cannot keep stamping consent for a
--      caller that never affirmed it.
--   5. An owner can no longer point partner_access.partner_id at a different
--      user, or rewrite the consent timestamp, from the client.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Child owner is immutable. Only the account that will own the row may
--    insert it (auth.uid() = parent_id). Partners keep UPDATE of the other
--    columns through the existing writer policy; they cannot move the row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_child_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'child owner cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_child_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_child_owner ON public.children;
CREATE TRIGGER protect_child_owner
  BEFORE UPDATE ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_child_owner();

DROP POLICY IF EXISTS insert_own_or_writer_children ON public.children;
CREATE POLICY insert_own_or_writer_children ON public.children
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id);

-- ---------------------------------------------------------------------------
-- 2. Profile columns the client must not write.
--    CoppaDirectNotice still writes the attestation columns. Onboarding still
--    writes primary_interest, has_partner, onboarding_completed_at.
--    handle_new_user (INSERT, security definer) stamps consent on signup.
--    send-vpc-email (service_role) and complete_vpc_second_confirmation
--    (security definer, current_user = postgres) write the vpc_* columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_server_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.vpc_method IS DISTINCT FROM OLD.vpc_method
     OR NEW.vpc_first_confirmation_at IS DISTINCT FROM OLD.vpc_first_confirmation_at
     OR NEW.vpc_second_confirmation_at IS DISTINCT FROM OLD.vpc_second_confirmation_at
     OR NEW.vpc_completed_at IS DISTINCT FROM OLD.vpc_completed_at
     OR NEW.vpc_second_token IS DISTINCT FROM OLD.vpc_second_token
     OR NEW.vpc_second_token_expires_at IS DISTINCT FROM OLD.vpc_second_token_expires_at
     OR NEW.inactive_purge_warned_at IS DISTINCT FROM OLD.inactive_purge_warned_at
     OR NEW.data_consent_given_at IS DISTINCT FROM OLD.data_consent_given_at
     OR NEW.data_consent_version IS DISTINCT FROM OLD.data_consent_version
  THEN
    RAISE EXCEPTION 'profile server columns are read-only';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_server_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_server_columns ON public.profiles;
CREATE TRIGGER protect_profile_server_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_server_columns();

-- Hash leftover plaintext tokens. The email already sent still works: the RPC
-- hashes the token from the link and compares it to this stored value.
-- Re-run is a no-op because rewritten values start with 'sha256:'.
UPDATE public.profiles
SET vpc_second_token = 'sha256:' || encode(extensions.digest(vpc_second_token, 'sha256'), 'hex')
WHERE vpc_second_token IS NOT NULL
  AND vpc_second_token NOT LIKE 'sha256:%';

CREATE OR REPLACE FUNCTION public.complete_vpc_second_confirmation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_first_at timestamptz;
  v_already_completed timestamptz;
  v_hash text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_hash := 'sha256:' || encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT id, vpc_first_confirmation_at, vpc_completed_at
    INTO v_profile_id, v_first_at, v_already_completed
  FROM public.profiles
  WHERE (vpc_second_token = v_hash OR vpc_second_token = p_token)
    AND (vpc_second_token_expires_at IS NULL OR vpc_second_token_expires_at > now())
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_token');
  END IF;

  IF v_already_completed IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  IF v_first_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_confirmation_missing');
  END IF;

  UPDATE public.profiles
  SET
    vpc_second_confirmation_at = now(),
    vpc_completed_at = now(),
    vpc_second_token = NULL,
    vpc_second_token_expires_at = NULL
  WHERE id = v_profile_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_vpc_second_confirmation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_vpc_second_confirmation(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Partner invite consent is an argument, not a side effect of calling.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.accept_partner_invitation(text);

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

  INSERT INTO public.partner_access (owner_id, partner_id, status, role, label, consent_acknowledged_at)
  VALUES (_invite.owner_id, auth.uid(), 'active', _invite.role, _invite.invitee_label, now())
  ON CONFLICT (owner_id, partner_id)
  DO UPDATE SET
    status = 'active',
    revoked_at = NULL,
    paused_at = NULL,
    role = EXCLUDED.role,
    label = COALESCE(EXCLUDED.label, public.partner_access.label),
    consent_acknowledged_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_partner_invitation(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_partner_invitation(text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. partner_access identity and the consent stamp are not client-writable.
--    Owners still update role / status / label / paused_at / revoked_at
--    (PartnerManagement revokes with a direct update; role and pause go
--    through security-definer RPCs, which run as postgres and may also set
--    consent_acknowledged_at).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_partner_access_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'partner_access identity columns cannot be changed';
  END IF;

  IF NEW.consent_acknowledged_at IS DISTINCT FROM OLD.consent_acknowledged_at
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'consent timestamp cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_partner_access_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_partner_access_identity ON public.partner_access;
CREATE TRIGGER protect_partner_access_identity
  BEFORE UPDATE ON public.partner_access
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_partner_access_identity();

-- ---------------------------------------------------------------------------
-- 5. Assertions.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.accept_partner_invitation(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'security_audit: one-argument accept_partner_invitation still exists';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.accept_partner_invitation(text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_partner_invitation(text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'security_audit: accept_partner_invitation grant is wrong';
  END IF;

  IF position('CONSENT_REQUIRED' IN (SELECT prosrc FROM pg_proc
              WHERE oid = 'public.accept_partner_invitation(text, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'security_audit: accept_partner_invitation does not require consent';
  END IF;

  IF position('sha256:' IN (SELECT prosrc FROM pg_proc
              WHERE oid = 'public.complete_vpc_second_confirmation(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'security_audit: vpc confirmation does not compare a hash';
  END IF;

  IF NOT (has_function_privilege('anon', 'public.complete_vpc_second_confirmation(text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.complete_vpc_second_confirmation(text)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'security_audit: vpc confirmation lost its logged-out grant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE vpc_second_token IS NOT NULL
      AND vpc_second_token NOT LIKE 'sha256:%'
  ) THEN
    RAISE EXCEPTION 'security_audit: plaintext vpc tokens remain';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'children' AND cmd = 'INSERT'
  ) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'children' AND cmd = 'INSERT'
      AND with_check LIKE '%auth.uid() = parent_id%'
      AND with_check NOT LIKE '%partner_can_write%'
  ) THEN
    RAISE EXCEPTION 'security_audit: children INSERT is not owner-only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.children'::regclass
      AND tgname = 'protect_child_owner' AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'protect_profile_server_columns' AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.partner_access'::regclass
      AND tgname = 'protect_partner_access_identity' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'security_audit: a protection trigger is missing';
  END IF;

  IF has_function_privilege('anon', 'public.protect_child_owner()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_child_owner()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_profile_server_columns()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_profile_server_columns()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.protect_partner_access_identity()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_partner_access_identity()', 'EXECUTE') THEN
    RAISE EXCEPTION 'security_audit: a trigger function is client-executable';
  END IF;
END $$;
