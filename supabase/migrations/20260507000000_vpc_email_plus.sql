-- Verifiable Parental Consent (COPPA, 16 CFR § 312.5(b)(2))
-- Implements the email-plus methodology:
--   1. First confirmation: parent confirms email at signup (Supabase Auth's built-in
--      Confirm Email flow). The auth.users trigger below mirrors email_confirmed_at
--      into profiles.vpc_first_confirmation_at.
--   2. Second confirmation: a delayed confirmatory email sent at least 24h after the
--      first, validated by complete_vpc_second_confirmation(). Stamping
--      vpc_completed_at unlocks child-record creation.
-- A BEFORE INSERT trigger on public.children blocks new child rows by the primary
-- parent (parent_id = auth.uid()) until vpc_completed_at IS NOT NULL.

-- 1. Schema additions on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vpc_method text,
  ADD COLUMN IF NOT EXISTS vpc_first_confirmation_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpc_second_confirmation_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpc_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vpc_second_token text,
  ADD COLUMN IF NOT EXISTS vpc_second_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS coppa_direct_notice_acknowledged_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_vpc_second_token_idx
  ON public.profiles (vpc_second_token)
  WHERE vpc_second_token IS NOT NULL;

COMMENT ON COLUMN public.profiles.vpc_method IS
  'COPPA VPC method per 16 CFR 312.5(b)(2). Values: email-plus, grandfathered_v1_checkbox.';
COMMENT ON COLUMN public.profiles.vpc_completed_at IS
  'Timestamp when both first and second email confirmations were validated and >=24h had elapsed between them. NULL until VPC is complete; child INSERTs are blocked until then.';
COMMENT ON COLUMN public.profiles.coppa_direct_notice_acknowledged_at IS
  'Timestamp when parent acknowledged the COPPA direct-notice modal at Add Child step (16 CFR 312.4(c)).';

-- 2. Grandfather existing accounts that completed the prior single-checkbox consent.
-- Treat the old data_consent_given_at as good-faith VPC. New accounts after this
-- migration go through the full email-plus flow.
UPDATE public.profiles
SET
  vpc_method = 'grandfathered_v1_checkbox',
  vpc_first_confirmation_at = data_consent_given_at,
  vpc_second_confirmation_at = data_consent_given_at,
  vpc_completed_at = data_consent_given_at
WHERE
  data_consent_given_at IS NOT NULL
  AND vpc_completed_at IS NULL;

-- 3. Mirror auth.users.email_confirmed_at into profiles.vpc_first_confirmation_at
CREATE OR REPLACE FUNCTION public.sync_email_confirmation_to_vpc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at) THEN
    UPDATE public.profiles
    SET
      vpc_method = COALESCE(vpc_method, 'email-plus'),
      vpc_first_confirmation_at = COALESCE(vpc_first_confirmation_at, NEW.email_confirmed_at)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_email_confirmation_to_vpc_trigger ON auth.users;
CREATE TRIGGER sync_email_confirmation_to_vpc_trigger
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_confirmation_to_vpc();

-- Backfill vpc_first_confirmation_at for users whose email is already confirmed
-- but who haven't been grandfathered above (e.g. confirmed but no checkbox).
UPDATE public.profiles p
SET
  vpc_method = COALESCE(p.vpc_method, 'email-plus'),
  vpc_first_confirmation_at = COALESCE(p.vpc_first_confirmation_at, u.email_confirmed_at)
FROM auth.users u
WHERE
  p.id = u.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.vpc_first_confirmation_at IS NULL;

-- 4. RPC: validate the second-confirmation token and complete VPC.
-- Called from the /vpc-confirm route. Verifies the 24-hour delay, the token's
-- existence, and expiry. Returns a JSON status that the client can branch on.
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

  IF (now() - v_first_at) < interval '24 hours' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'too_soon',
      'wait_until', (v_first_at + interval '24 hours')
    );
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

GRANT EXECUTE ON FUNCTION public.complete_vpc_second_confirmation(text) TO authenticated, anon;

-- 5. Block child INSERT until the primary parent's VPC is complete.
-- A BEFORE INSERT trigger gives us a clear, raisable error. The check only fires
-- when the inserter is the primary parent (parent_id = auth.uid()); partner
-- inserts are governed by the existing has_partner_access RLS path.
CREATE OR REPLACE FUNCTION public.enforce_vpc_on_child_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    -- Service-role / migrations bypass; not subject to COPPA.
    RETURN NEW;
  END IF;

  IF NEW.parent_id = auth.uid() THEN
    SELECT vpc_completed_at INTO v_completed
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_completed IS NULL THEN
      RAISE EXCEPTION 'Verifiable Parental Consent (COPPA) is not yet complete for this account.'
        USING ERRCODE = 'P0001', HINT = 'vpc_not_completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vpc_on_child_insert_trigger ON public.children;
CREATE TRIGGER enforce_vpc_on_child_insert_trigger
  BEFORE INSERT ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vpc_on_child_insert();
