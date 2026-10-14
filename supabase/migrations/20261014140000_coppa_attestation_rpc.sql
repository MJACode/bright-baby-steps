-- SECURITY / COPPA: the typed-name digital signature and the direct-notice
-- acknowledgement are written by the server, never by the client.
--
-- Version 20261014140000 sorts after 20261014120000_security_audit_fixes.sql. (Renamed from
-- 20261014130000, which open PR #295 also uses; the migrate job skips a version
-- it has already recorded and still exits 0, so a clash would silently skip one file.)
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE,
-- REVOKE/GRANT. A re-run is a no-op. No transaction control: the CI migrate
-- job wraps the file in BEGIN/COMMIT, so any RAISE EXCEPTION rolls it back.
--
-- NEEDS OWNER APPROVAL BEFORE MERGE. Merging applies this file to production.
--
-- Why: until now CoppaDirectNotice.tsx wrote coppa_direct_notice_acknowledged_at,
-- coppa_attestation_signed_name and coppa_attestation_signed_at straight onto
-- the profile with profiles.update() and a CLIENT timestamp, and
-- coppa_attestation_ip was never written at all. A signed-in parent could
-- forge, backdate or overwrite the "plus" step of email-plus VPC
-- (16 CFR 312.5(b)(2)(ii)) and the direct-notice acknowledgement
-- (16 CFR 312.4(c)). 20261014120000 locked the vpc_* / data_consent_* columns
-- but had to leave these four writable for that client call.
--
-- What it does:
--   0. New column profiles.coppa_direct_notice_version: which direct-notice
--      text the parent signed (the client constant COPPA_DIRECT_NOTICE_VERSION
--      in CoppaDirectNotice.tsx, bumped whenever the notice text changes).
--      NULL on signatures made before this migration = the notice text as of
--      2026-05-08 (v1).
--   1. public.sign_coppa_direct_notice(p_signed_name text, p_notice_version text)
--      RETURNS jsonb, SECURITY DEFINER, search_path pinned. For auth.uid() it
--      validates the name and version and stamps the four coppa_* columns plus
--      the version with server now() and the request IP.
--   2. protect_profile_server_columns() also rejects client changes to the five
--      coppa_* columns, and the trigger now fires on INSERT as well as UPDATE
--      (the "Users can insert own profile" policy would otherwise let a client
--      that somehow had no profile row insert one with forged consent values;
--      every column it guards defaults to NULL, so a client INSERT must leave
--      them NULL). handle_new_user is SECURITY DEFINER owned by postgres, so
--      its INSERT is exempt exactly like the RPCs.
--
-- Immutability decision: the FIRST signature is the legal record. Once
-- coppa_attestation_signed_at is set, a second call changes nothing and returns
-- the existing record with already_signed = true. Nothing in the app re-shows
-- the notice after it is signed (AddChildDialog and OnboardingWizard step 5 both
-- skip it when coppa_direct_notice_acknowledged_at is set), so no legitimate
-- flow needs to re-sign. A profile acknowledged before the 2026-05-08
-- typed-name step (ack set, signature NULL) can still sign once; its original
-- acknowledgement timestamp is kept (coalesce), not moved forward.
--
-- IP: best-effort evidence, not proof. Taken from the PostgREST request headers:
-- cf-connecting-ip (set by Supabase's Cloudflare edge) first, else the first
-- hop of x-forwarded-for. Anything that does not cast to inet is stored as
-- NULL rather than failing the signature.
--
-- Unaffected: _purge_user_data / delete_user_account DELETE the profile (the
-- trigger is INSERT/UPDATE only). exportUserData only SELECTs these columns.
-- service_role paths (edge functions) stay exempt.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Notice-version column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coppa_direct_notice_version text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_coppa_direct_notice_version_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_coppa_direct_notice_version_check
      CHECK (coppa_direct_notice_version IS NULL
             OR (char_length(coppa_direct_notice_version) BETWEEN 1 AND 32
                 AND coppa_direct_notice_version ~ '^[0-9A-Za-z._-]+$'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.coppa_direct_notice_version IS
  'Version of the COPPA direct-notice text the parent signed (COPPA_DIRECT_NOTICE_VERSION in CoppaDirectNotice.tsx). Set once by sign_coppa_direct_notice. NULL on a signature = signed before versioning (notice text as of 2026-05-08, v1).';

-- ---------------------------------------------------------------------------
-- 1. Signing RPC.
-- ---------------------------------------------------------------------------
-- Only the two-argument signature may exist. The one-argument draft was never
-- applied anywhere; the DROP keeps a re-run (or a stray local copy) clean.
DROP FUNCTION IF EXISTS public.sign_coppa_direct_notice(text);

CREATE OR REPLACE FUNCTION public.sign_coppa_direct_notice(
  p_signed_name text,
  p_notice_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_version text;
  v_headers json;
  v_ip inet;
  v_row public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again to sign this notice.'
      USING ERRCODE = '42501';
  END IF;

  -- Trim and collapse internal whitespace so "Jane   Doe" and "Jane Doe" are
  -- the same signature.
  v_name := btrim(regexp_replace(coalesce(p_signed_name, ''), '\s+', ' ', 'g'));

  IF v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Your name contains characters we cannot accept. Type it using letters only.'
      USING ERRCODE = '22023';
  END IF;
  IF array_length(string_to_array(v_name, ' '), 1) IS NULL
     OR array_length(string_to_array(v_name, ' '), 1) < 2 THEN
    RAISE EXCEPTION 'Type your full name (first and last) to sign.'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Your name is too long. Use 200 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  v_version := btrim(coalesce(p_notice_version, ''));
  IF v_version = '' OR char_length(v_version) > 32
     OR v_version !~ '^[0-9A-Za-z._-]+$' THEN
    RAISE EXCEPTION 'This notice is out of date. Refresh the app and try again.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_ip := nullif(btrim(coalesce(
      v_headers ->> 'cf-connecting-ip',
      split_part(v_headers ->> 'x-forwarded-for', ',', 1)
    )), '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  -- First signature wins. The WHERE makes concurrent calls safe: only one
  -- UPDATE can match the NULL signature.
  UPDATE public.profiles
  SET coppa_direct_notice_acknowledged_at = coalesce(coppa_direct_notice_acknowledged_at, now()),
      coppa_attestation_signed_name = v_name,
      coppa_attestation_signed_at = now(),
      coppa_attestation_ip = v_ip,
      coppa_direct_notice_version = v_version
  WHERE id = v_uid
    AND coppa_attestation_signed_at IS NULL
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'acknowledged_at', v_row.coppa_direct_notice_acknowledged_at,
      'signed_at', v_row.coppa_attestation_signed_at,
      'signed_name', v_row.coppa_attestation_signed_name,
      'notice_version', v_row.coppa_direct_notice_version,
      'already_signed', false
    );
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'We could not find your profile. Sign out, sign back in, and try again.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'acknowledged_at', v_row.coppa_direct_notice_acknowledged_at,
    'signed_at', v_row.coppa_attestation_signed_at,
    'signed_name', v_row.coppa_attestation_signed_name,
    'notice_version', v_row.coppa_direct_notice_version,
    'already_signed', true
  );
END;
$$;

COMMENT ON FUNCTION public.sign_coppa_direct_notice(text, text) IS
  'COPPA direct notice + typed-name digital signature (email-plus VPC). Stamps coppa_direct_notice_acknowledged_at, coppa_attestation_signed_name/_at/_ip and coppa_direct_notice_version for auth.uid() with server time. First signature is the legal record; later calls return it unchanged (already_signed = true).';

-- Default EXECUTE is off since 20261008020000; grant explicitly.
REVOKE EXECUTE ON FUNCTION public.sign_coppa_direct_notice(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_coppa_direct_notice(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lock the coppa_* columns. Everything 20261014120000 protected is kept.
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

  IF TG_OP = 'INSERT' THEN
    -- Every guarded column defaults to NULL; only the server may set them.
    IF NEW.vpc_method IS NOT NULL
       OR NEW.vpc_first_confirmation_at IS NOT NULL
       OR NEW.vpc_second_confirmation_at IS NOT NULL
       OR NEW.vpc_completed_at IS NOT NULL
       OR NEW.vpc_second_token IS NOT NULL
       OR NEW.vpc_second_token_expires_at IS NOT NULL
       OR NEW.inactive_purge_warned_at IS NOT NULL
       OR NEW.data_consent_given_at IS NOT NULL
       OR NEW.data_consent_version IS NOT NULL
       OR NEW.coppa_direct_notice_acknowledged_at IS NOT NULL
       OR NEW.coppa_attestation_signed_name IS NOT NULL
       OR NEW.coppa_attestation_signed_at IS NOT NULL
       OR NEW.coppa_attestation_ip IS NOT NULL
       OR NEW.coppa_direct_notice_version IS NOT NULL
    THEN
      RAISE EXCEPTION 'profile server columns are read-only';
    END IF;
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
     OR NEW.coppa_direct_notice_acknowledged_at IS DISTINCT FROM OLD.coppa_direct_notice_acknowledged_at
     OR NEW.coppa_attestation_signed_name IS DISTINCT FROM OLD.coppa_attestation_signed_name
     OR NEW.coppa_attestation_signed_at IS DISTINCT FROM OLD.coppa_attestation_signed_at
     OR NEW.coppa_attestation_ip IS DISTINCT FROM OLD.coppa_attestation_ip
     OR NEW.coppa_direct_notice_version IS DISTINCT FROM OLD.coppa_direct_notice_version
  THEN
    RAISE EXCEPTION 'profile server columns are read-only';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_server_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_server_columns ON public.profiles;
CREATE TRIGGER protect_profile_server_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_server_columns();

-- ---------------------------------------------------------------------------
-- 3. Assertions. Any failure rolls the file back.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_src text;
  v_col text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'protect_profile_server_columns'
      AND tgenabled <> 'D'
      AND (tgtype & 4) <> 0   -- INSERT
      AND (tgtype & 16) <> 0  -- UPDATE
      AND (tgtype & 2) <> 0   -- BEFORE
  ) THEN
    RAISE EXCEPTION 'coppa_attestation: protect_profile_server_columns trigger missing, disabled, or not BEFORE INSERT OR UPDATE';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
  WHERE oid = 'public.protect_profile_server_columns()'::regprocedure;
  FOREACH v_col IN ARRAY ARRAY[
    'coppa_direct_notice_acknowledged_at', 'coppa_attestation_signed_name',
    'coppa_attestation_signed_at', 'coppa_attestation_ip',
    'coppa_direct_notice_version',
    'vpc_completed_at', 'vpc_second_token', 'data_consent_given_at',
    'inactive_purge_warned_at', 'NEW.email IS DISTINCT FROM OLD.email'
  ] LOOP
    IF position(v_col IN v_src) = 0 THEN
      RAISE EXCEPTION 'coppa_attestation: trigger does not guard %', v_col;
    END IF;
  END LOOP;

  IF to_regprocedure('public.sign_coppa_direct_notice(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'coppa_attestation: the one-argument sign_coppa_direct_notice must not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_coppa_direct_notice_version_check'
  ) THEN
    RAISE EXCEPTION 'coppa_attestation: coppa_direct_notice_version CHECK missing';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc
          WHERE oid = 'public.sign_coppa_direct_notice(text, text)'::regprocedure) THEN
    RAISE EXCEPTION 'coppa_attestation: sign_coppa_direct_notice is not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.sign_coppa_direct_notice(text, text)'::regprocedure
      AND proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'coppa_attestation: sign_coppa_direct_notice search_path not pinned';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.sign_coppa_direct_notice(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sign_coppa_direct_notice(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'coppa_attestation: sign_coppa_direct_notice must be executable by authenticated only';
  END IF;

  IF has_function_privilege('anon', 'public.protect_profile_server_columns()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.protect_profile_server_columns()', 'EXECUTE') THEN
    RAISE EXCEPTION 'coppa_attestation: trigger function is client-executable';
  END IF;
END $$;
