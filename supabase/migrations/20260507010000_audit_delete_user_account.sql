-- Audit and complete delete_user_account() per the legal review's T7 finding.
--
-- Before this migration, the RPC:
--   1. Did NOT purge Storage objects in feedback-screenshots or milestone-photos
--      (it only removed DB rows), leaving uploaded photos accessible by signed
--      URL until storage rotated naturally. Privacy § 8 promises 30-day Storage
--      deletion — this closes that gap.
--   2. Could fail with a foreign-key violation on the final
--      `DELETE FROM public.profiles` because many tables in records_tables.sql
--      and related migrations reference profiles(id) WITHOUT ON DELETE CASCADE.
--      Tables affected: pediatrician_visits, vaccinations, dental_visits,
--      health_insurance, life_insurance, college_savings, college_contributions,
--      ei_tracker, ei_providers, birth_certificates, supplements,
--      supplement_logs, illness_logs, medication_logs, child_checklist_items.
--
-- This migration replaces the function so it deletes those tables explicitly,
-- then purges storage objects for the user. The function continues to return
-- void so existing client callers do not need changes.

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

  -- Chat history
  DELETE FROM public.chat_messages
  WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = _uid
  );
  DELETE FROM public.chat_conversations WHERE user_id = _uid;

  -- Notifications and feedback
  DELETE FROM public.notifications WHERE user_id = _uid;
  DELETE FROM public.feedback WHERE user_id = _uid;

  -- Partner relationships
  DELETE FROM public.partner_invitations WHERE owner_id = _uid;
  DELETE FROM public.partner_access WHERE owner_id = _uid OR partner_id = _uid;

  -- Pediatrician exports
  DELETE FROM public.pediatrician_exports WHERE parent_id = _uid;
  DELETE FROM public.pediatrician_reminders WHERE parent_id = _uid;

  -- Records tables that reference profiles(id) without ON DELETE CASCADE.
  -- These would otherwise block the final profiles delete with FK violations.
  DELETE FROM public.pediatrician_visits   WHERE parent_id = _uid;
  DELETE FROM public.vaccinations          WHERE parent_id = _uid;
  DELETE FROM public.dental_visits         WHERE parent_id = _uid;
  DELETE FROM public.health_insurance      WHERE parent_id = _uid;
  DELETE FROM public.life_insurance        WHERE parent_id = _uid;
  DELETE FROM public.college_savings       WHERE parent_id = _uid;
  DELETE FROM public.college_contributions WHERE parent_id = _uid;
  DELETE FROM public.ei_tracker            WHERE parent_id = _uid;
  DELETE FROM public.ei_providers          WHERE parent_id = _uid;
  DELETE FROM public.birth_certificates    WHERE parent_id = _uid;
  DELETE FROM public.supplements           WHERE parent_id = _uid;
  DELETE FROM public.supplement_logs       WHERE parent_id = _uid;
  DELETE FROM public.illness_logs          WHERE parent_id = _uid;
  DELETE FROM public.medication_logs       WHERE parent_id = _uid;
  DELETE FROM public.child_checklist_items WHERE parent_id = _uid;

  -- Children — cascades to weight_logs, sleep_logs, feeding_logs, diaper_logs,
  -- allergen_introductions, allergen_exposure_logs, allergen_reactions,
  -- child_speech, custom_milestones, caregiver_notes, pumping_schedules,
  -- and any other child_id-referencing tables with ON DELETE CASCADE.
  DELETE FROM public.children WHERE parent_id = _uid;

  -- Storage objects — Privacy § 8 promises Storage deletion within 30 days.
  -- Buckets are namespaced as {user_id}/... by convention (see FeedbackDialog
  -- and MilestoneCard upload paths).
  DELETE FROM storage.objects
  WHERE bucket_id IN ('feedback-screenshots', 'milestone-photos')
    AND (storage.foldername(name))[1] = _uid::text;

  -- Profile and auth user
  DELETE FROM public.profiles WHERE id = _uid;
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMENT ON FUNCTION public.delete_user_account() IS
  'GDPR Art. 17 right to erasure. Purges all DB rows owned by auth.uid() across '
  'records, chat, partner, feedback, and child-linked tables, plus all Storage '
  'objects in feedback-screenshots and milestone-photos under {uid}/ prefix, '
  'then removes the auth.users row. Backups follow the project rotation.';
