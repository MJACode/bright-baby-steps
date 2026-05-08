-- Drop the 24-hour VPC dwell + add typed-name attestation columns.
--
-- Why: 16 CFR § 312.5(b)(2)(ii) ("email-plus") does not specify any time
-- delay between the first and second confirmation emails — the "delayed"
-- language lives only in FTC staff Q&A, not the regulatory text. The prior
-- 24-hour wait was a UX-hostile conservative choice. With this migration the
-- dwell drops to zero; the "plus" step now consists of:
--   (a) A separately-actionable second email click (the Resend-sent VPC
--       confirmation link), and
--   (b) A typed-name attestation captured in the direct-notice modal at Add
--       Child time, persisted in the new columns below.
--
-- This migration moves in lockstep with the matching frontend + edge
-- function changes in the same PR. PrivacyPage.tsx § 6 is rewritten to
-- remove the "at least 24 hours later" sentence so policy and code match
-- (avoiding FTC Act § 5 deception exposure of the Flo Health / BetterHelp
-- variety).
--
-- Outstanding outside-counsel sign-off (per CLAUDE.md):
--   1. Whether to enforce a non-zero gap (this migration uses 0; counsel may
--      ask us to add a 15–30 min server gap as a "token of respect").
--   2. Confirm Anthropic-as-processor stays inside § 312.2 "internal use"
--      under the executed DPA.
--   3. Confirm typed-name attestation is treated as direct-notice
--      acknowledgement (16 CFR § 312.4(c)) rather than as VPC standing
--      alone — the operative VPC method remains the two email confirmations.

-- 1. Attestation columns (defense-in-depth; not a § 312.5(b)(2) method
--    standing alone, per legal pre-review).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coppa_attestation_signed_name text,
  ADD COLUMN IF NOT EXISTS coppa_attestation_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS coppa_attestation_ip inet;

COMMENT ON COLUMN public.profiles.coppa_attestation_signed_name IS
  'Typed legal name the parent supplied as a digital signature in the Add Child direct-notice modal. Defense-in-depth for COPPA email-plus VPC; not a § 312.5(b)(2) consent method standing alone.';
COMMENT ON COLUMN public.profiles.coppa_attestation_signed_at IS
  'When the typed-name attestation was submitted. Paired with coppa_direct_notice_acknowledged_at (which stamps when the modal was acknowledged).';
COMMENT ON COLUMN public.profiles.coppa_attestation_ip IS
  'IP address recorded with the typed-name attestation, for evidentiary record. May be NULL for grandfathered rows or partner accounts.';

-- 2. Update the comment on vpc_completed_at to remove the 24h reference.
COMMENT ON COLUMN public.profiles.vpc_completed_at IS
  'Timestamp when both first and second email confirmations were validated. NULL until VPC is complete; child INSERTs are blocked until then.';

-- 3. Replace complete_vpc_second_confirmation() to remove the interval check.
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
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT id, vpc_first_confirmation_at, vpc_completed_at
    INTO v_profile_id, v_first_at, v_already_completed
  FROM public.profiles
  WHERE vpc_second_token = p_token
    AND (vpc_second_token_expires_at IS NULL OR vpc_second_token_expires_at > now())
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_token');
  END IF;

  IF v_already_completed IS NOT NULL THEN
    -- Idempotent: re-clicking the email link returns success.
    RETURN jsonb_build_object('ok', true, 'already_completed', true);
  END IF;

  IF v_first_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_confirmation_missing');
  END IF;

  -- Dwell check intentionally removed. § 312.5(b)(2)(ii) requires "additional
  -- steps to provide assurances that the person providing the consent is the
  -- parent" — the rule itself does not specify a time delay. Our additional
  -- steps are: (i) inbox control demonstrated twice via two separately-
  -- actionable email clicks; (ii) the typed-name attestation captured in the
  -- direct-notice modal before this token was minted.

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

GRANT EXECUTE ON FUNCTION public.complete_vpc_second_confirmation(text) TO authenticated, anon;
