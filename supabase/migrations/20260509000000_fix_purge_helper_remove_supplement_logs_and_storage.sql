-- Fix two production bugs surfaced while smoke-testing account deletion on
-- 2026-05-09 against the live project (ieuznbvvwdvhtirzwkly):
--
--   Bug 1: _purge_user_data() and delete_user_account() reference
--          public.supplement_logs, which does NOT exist in the schema. The
--          live project has public.supplements (parent_id + child_id) but no
--          companion logs table. The DELETE statement raised
--          `relation "public.supplement_logs" does not exist` which aborted
--          the whole transaction, meaning the inactive-account auto-purge
--          cron and the user-initiated delete-account RPC both failed in
--          production for every user.
--
--   Bug 2: Both functions did `DELETE FROM storage.objects WHERE bucket_id IN
--          (...) AND (storage.foldername(name))[1] = _uid::text`. The hosted
--          Supabase project has the `storage.protect_delete()` trigger which
--          blocks direct DELETE on storage.objects with
--          `42501: Direct deletion from storage tables is not allowed. Use
--          the Storage API instead.` — even when the function is SECURITY
--          DEFINER. This means the storage cleanup never ran in production
--          and Privacy § 8's "Files in object storage are deleted within 30
--          days" promise was being silently broken.
--
-- Architecture change: storage cleanup now happens in the calling edge
-- function (inactive-account-purge for the cron, the new delete-account
-- function for user-initiated deletes) using the Supabase JS SDK's
-- supabase.storage.from(bucket).remove([...paths]) API, which goes through
-- the proper Storage admin path and bypasses the protect_delete trigger.
-- The SQL helpers below are now DB-only.
--
-- Also adds explicit deletes for the two child_id-referencing tables that do
-- NOT cascade on DELETE FROM children:
--   - parent_financial_checklist (child_id, NO ACTION)
--   - pediatrician_exports       (child_id, NO ACTION)
-- Without these, DELETE FROM children would FK-violate for any user who had
-- rows in either table. All other 27 child_id-referencing tables CASCADE
-- properly and are cleaned up implicitly when children is deleted.

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

  -- Chat history (user_id-referencing)
  DELETE FROM public.chat_messages
  WHERE conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = _uid
  );
  DELETE FROM public.chat_conversations WHERE user_id = _uid;

  -- Other user_id-referencing tables
  DELETE FROM public.notifications   WHERE user_id = _uid;
  DELETE FROM public.feedback        WHERE user_id = _uid;
  DELETE FROM public.subscriptions   WHERE user_id = _uid;
  DELETE FROM public.rights_requests WHERE user_id = _uid;

  -- Partner relationships
  DELETE FROM public.partner_invitations WHERE owner_id = _uid;
  DELETE FROM public.partner_access      WHERE owner_id = _uid OR partner_id = _uid;

  -- Parent-only tables (no cascading path through children)
  DELETE FROM public.ei_providers          WHERE parent_id = _uid;
  DELETE FROM public.college_contributions WHERE parent_id = _uid;

  -- child_id-referencing tables that do NOT cascade on DELETE FROM children.
  -- These must be cleared explicitly before the children DELETE below.
  DELETE FROM public.parent_financial_checklist
    WHERE child_id IN (SELECT id FROM public.children WHERE parent_id = _uid);
  DELETE FROM public.pediatrician_exports
    WHERE child_id IN (SELECT id FROM public.children WHERE parent_id = _uid);

  -- Children — cascades to all 27 child_id-referencing tables that have
  -- ON DELETE CASCADE (allergen_*, birth_certificates, caregiver_notes,
  -- chat_conversations[child_id], child_checklist_items, child_speech,
  -- college_savings, cry_analyses, dental_visits, diaper_logs, ei_tracker,
  -- feeding_logs, health_insurance, illness_logs, life_insurance,
  -- medication_logs, milestone_flags, notifications[child_id],
  -- pediatrician_reminders, pediatrician_visits, sleep_logs, speech_journal,
  -- supplements, vaccinations, weight_logs).
  DELETE FROM public.children WHERE parent_id = _uid;

  -- Profile and auth user. Storage cleanup is the caller's responsibility
  -- (see inactive-account-purge and delete-account edge functions) — the
  -- storage.protect_delete() trigger blocks direct DELETE FROM
  -- storage.objects even from SECURITY DEFINER functions.
  DELETE FROM public.profiles WHERE id = _uid;
  DELETE FROM auth.users      WHERE id = _uid;
END;
$$;

REVOKE ALL ON FUNCTION public._purge_user_data(uuid) FROM PUBLIC;

-- Mirror the same fixes into delete_user_account() for the user-initiated
-- path. Storage cleanup belongs in the new delete-account edge function.
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

  PERFORM public._purge_user_data(_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMENT ON FUNCTION public.delete_user_account() IS
  'GDPR Art. 17 right to erasure (DB side). Delegates to _purge_user_data() '
  'after asserting the caller is authenticated. Storage cleanup happens in '
  'the delete-account edge function (Storage admin API), which calls this '
  'RPC after deleting feedback-screenshots/{uid}/* and milestone-photos/{uid}/*.';

COMMENT ON FUNCTION public._purge_user_data(uuid) IS
  'DB-only purge of every row owned by _uid across chat, notifications, '
  'feedback, subscriptions, rights_requests, partner_*, ei_providers, '
  'college_contributions, parent_financial_checklist, pediatrician_exports, '
  'children (cascades to 27 child_id tables), profiles, auth.users. '
  'Storage cleanup is the caller''s responsibility (Storage admin API).';
