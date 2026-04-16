-- Compliance & security migration
-- 1. Wire up data consent columns on user signup
-- 2. Fix feedback screenshots bucket to authenticated-only read
-- 3. Add delete_user_account() RPC for GDPR right to erasure

-- ── Consent columns ──────────────────────────────────────────────────────────
-- Columns (data_consent_given_at, data_consent_version) already exist on profiles.
-- Populate them via trigger when a new user signs up.

CREATE OR REPLACE FUNCTION public.handle_new_user_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    data_consent_given_at = NOW(),
    data_consent_version  = COALESCE(NEW.raw_user_meta_data->>'data_consent_version', '1.0')
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Fire after handle_new_user creates the profile row
CREATE OR REPLACE TRIGGER on_auth_user_consent
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_consent();

-- ── Feedback screenshots: remove public read, add authenticated-only ─────────
DROP POLICY IF EXISTS "Public read access for feedback screenshots" ON storage.objects;

CREATE POLICY "Users can view own feedback screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ── delete_user_account(): GDPR right to erasure ─────────────────────────────
-- Cascades via FK ON DELETE CASCADE where set; manually cleans remainder.
-- Must be called by the authenticated user themselves.

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Remove chat history
  DELETE FROM public.chat_messages
  WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = _uid
  );
  DELETE FROM public.chat_conversations WHERE user_id = _uid;

  -- Remove notifications
  DELETE FROM public.notifications WHERE user_id = _uid;

  -- Remove partner relationships
  DELETE FROM public.partner_invitations WHERE owner_id = _uid;
  DELETE FROM public.partner_access WHERE owner_id = _uid OR partner_id = _uid;

  -- Remove feedback
  DELETE FROM public.feedback WHERE user_id = _uid;

  -- Remove pediatrician exports
  DELETE FROM public.pediatrician_exports WHERE parent_id = _uid;
  DELETE FROM public.pediatrician_reminders WHERE parent_id = _uid;

  -- Remove child-linked data (children rows cascade the rest via FK)
  DELETE FROM public.children WHERE parent_id = _uid;

  -- Remove profile
  DELETE FROM public.profiles WHERE id = _uid;

  -- Remove auth user (requires service role; SECURITY DEFINER grants it)
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
