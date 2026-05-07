-- T6 — inactive-account auto-purge per the legal review.
--
-- Privacy § 8 promises:
--   "If you do not sign in for 24 consecutive months, we will email you a
--    30-day deletion warning. If you do not sign in within that window, your
--    account and all child records will be deleted on the same schedule above."
--
-- Two-stage flow run daily by pg_cron:
--   Stage 1: 24 months of inactivity → email warning, stamp inactive_purge_warned_at
--   Stage 2: warned + 30 days, still inactive → call _purge_user_data(uid)
--
-- This migration also refactors the deletion code path so delete_user_account()
-- (user-initiated) and the new admin-callable purge share the same internal
-- helper. The helper does NOT consult auth.uid() — that's the caller's job —
-- so it can be invoked safely from the cron edge function with the service
-- role.

-- 1. Extra column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactive_purge_warned_at timestamptz;

-- 2. Internal helper that does the heavy lifting. Not GRANTed to anyone.
CREATE OR REPLACE FUNCTION public._purge_user_data(_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'uid required';
  END IF;

  DELETE FROM public.chat_messages
  WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = _uid
  );
  DELETE FROM public.chat_conversations WHERE user_id = _uid;

  DELETE FROM public.notifications WHERE user_id = _uid;
  DELETE FROM public.feedback WHERE user_id = _uid;

  DELETE FROM public.partner_invitations WHERE owner_id = _uid;
  DELETE FROM public.partner_access WHERE owner_id = _uid OR partner_id = _uid;

  DELETE FROM public.pediatrician_exports   WHERE parent_id = _uid;
  DELETE FROM public.pediatrician_reminders WHERE parent_id = _uid;
  DELETE FROM public.pediatrician_visits    WHERE parent_id = _uid;
  DELETE FROM public.vaccinations           WHERE parent_id = _uid;
  DELETE FROM public.dental_visits          WHERE parent_id = _uid;
  DELETE FROM public.health_insurance       WHERE parent_id = _uid;
  DELETE FROM public.life_insurance         WHERE parent_id = _uid;
  DELETE FROM public.college_savings        WHERE parent_id = _uid;
  DELETE FROM public.college_contributions  WHERE parent_id = _uid;
  DELETE FROM public.ei_tracker             WHERE parent_id = _uid;
  DELETE FROM public.ei_providers           WHERE parent_id = _uid;
  DELETE FROM public.birth_certificates     WHERE parent_id = _uid;
  DELETE FROM public.supplements            WHERE parent_id = _uid;
  DELETE FROM public.supplement_logs        WHERE parent_id = _uid;
  DELETE FROM public.illness_logs           WHERE parent_id = _uid;
  DELETE FROM public.medication_logs        WHERE parent_id = _uid;
  DELETE FROM public.child_checklist_items  WHERE parent_id = _uid;

  DELETE FROM public.children WHERE parent_id = _uid;

  DELETE FROM storage.objects
  WHERE bucket_id IN ('feedback-screenshots', 'milestone-photos')
    AND (storage.foldername(name))[1] = _uid::text;

  DELETE FROM public.profiles WHERE id = _uid;
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

REVOKE ALL ON FUNCTION public._purge_user_data(uuid) FROM PUBLIC;

-- 3. Replace the user-initiated delete_user_account so it delegates to the helper
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM public._purge_user_data(auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- 4. Admin variant for the cron job
CREATE OR REPLACE FUNCTION public.purge_inactive_account(_target_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._purge_user_data(_target_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_inactive_account(uuid) FROM PUBLIC;
-- Service role only; do NOT grant to authenticated.

-- 5. Schedule the cron call to the inactive-account-purge edge function.
-- Runs daily at 02:30 UTC (low-traffic). Requires app.supabase_url and
-- app.service_role_key to be set on the DB (same pattern as
-- 20260502020000_reactivation_cron.sql).
DO $$
BEGIN
  PERFORM cron.unschedule('inactive-account-purge-daily')
  FROM cron.job WHERE jobname = 'inactive-account-purge-daily';
EXCEPTION WHEN undefined_function THEN
  NULL;
END$$;

SELECT cron.schedule(
  'inactive-account-purge-daily',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/inactive-account-purge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

COMMENT ON COLUMN public.profiles.inactive_purge_warned_at IS
  'Timestamp when the 30-day inactive-purge warning email was sent. NULL for '
  'active users. Set by the inactive-account-purge edge function. Cleared if '
  'the user signs in again before the purge fires.';

COMMENT ON FUNCTION public.purge_inactive_account(uuid) IS
  'Admin-callable purge. SECURITY DEFINER, NOT GRANTED to authenticated. '
  'Called by the inactive-account-purge edge function with the service role.';
