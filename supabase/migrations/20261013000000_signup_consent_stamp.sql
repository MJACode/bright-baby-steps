-- LEGAL: record the signup Terms/Privacy consent server-side.
--
-- Bug (founder-approved fix, 2026-10-12): src/pages/Auth.tsx stamped
-- profiles.data_consent_given_at / data_consent_version with a client UPDATE
-- straight after supabase.auth.signUp(). With Supabase Auth "Confirm email"
-- ON there is no session at that point, so the UPDATE ran as anon, matched no
-- row under RLS and silently did nothing. Live on 2026-10-12: all 5 profiles
-- have data_consent_given_at NULL.
--
-- Fix: the signup form (which already requires the Terms/Privacy checkbox,
-- `agreedToTerms`) now sends `data_consent_version` in signUp user metadata
-- (auth.users.raw_user_meta_data), and the existing AFTER INSERT trigger on
-- auth.users copies it into profiles here, stamping the time with the
-- server's now() (never a client-supplied timestamp). The client UPDATE was
-- removed in the same PR (commit 94e5ba8).
--
-- Live definition read via pg_get_functiondef before writing (2026-10-12):
--   INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
-- SECURITY DEFINER, search_path = public, ACL {postgres, service_role} only
-- (client EXECUTE revoked by 20261008020000; trigger firing does not check
-- EXECUTE). Fired by on_auth_user_created AFTER INSERT ON auth.users.
-- Everything it did is preserved; this adds:
--   * data_consent_version / data_consent_given_at, only when the metadata
--     key is present and non-blank (admin/dashboard-created users carry no
--     consent and stay NULL rather than getting a fabricated stamp).
--   * full_name from the same metadata. Auth.tsx has always sent full_name,
--     but the trigger never copied it, so profiles.full_name is NULL for every
--     account and the partner surfaces that read it (useLoggedByNames,
--     usePartnerLogToast, FamilyMomentsCard) fall back to "Family" /
--     "Your partner". Not backfilled here (separate decision).
-- Both metadata strings are client-supplied: trimmed and length-capped.
--
-- Signup paths checked: Auth.tsx is the only supabase.auth.signUp call in
-- src/** and supabase/functions/**; there is no signInWithOAuth / OTP /
-- IdToken signup. Partner invitees go through the same /auth signup form
-- (AcceptInvite -> /auth, pending_invite carried in the same metadata).
--
-- No backfill of the 5 existing profiles: their signup consent was never
-- recorded and we will not fabricate a timestamp. See
-- docs/legal-review-log.md (2026-10-12) for the evidence those accounts do
-- carry (vpc_* / coppa_* / partner_access.consent_acknowledged_at).
--
-- Idempotent: CREATE OR REPLACE + REVOKE are re-run safe. No new client grant.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _consent_version text := left(nullif(btrim(NEW.raw_user_meta_data->>'data_consent_version'), ''), 32);
  _full_name       text := left(nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''), 200);
BEGIN
  INSERT INTO public.profiles (id, email, full_name, data_consent_version, data_consent_given_at)
  VALUES (
    NEW.id,
    NEW.email,
    _full_name,
    _consent_version,
    CASE WHEN _consent_version IS NOT NULL THEN now() END
  );
  RETURN NEW;
END;
$$;

-- Trigger function: no client EXECUTE (keeps 20261008020000's end state).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  _fn oid := 'public.handle_new_user()'::regprocedure;
  _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc WHERE oid = _fn;
  IF position('data_consent_given_at' IN _src) = 0
     OR position('raw_user_meta_data->>''data_consent_version''' IN _src) = 0 THEN
    RAISE EXCEPTION 'signup_consent_stamp: handle_new_user does not stamp consent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = _fn AND prosecdef) THEN
    RAISE EXCEPTION 'signup_consent_stamp: handle_new_user is not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', _fn, 'EXECUTE')
     OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'signup_consent_stamp: handle_new_user is client-executable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgfoid = _fn AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'signup_consent_stamp: no enabled auth.users trigger calls handle_new_user';
  END IF;
END $$;
