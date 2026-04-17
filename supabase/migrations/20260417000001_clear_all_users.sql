-- Pre-launch cleanup: delete all test users and their data.
-- Uses dynamic SQL so missing tables are skipped rather than failing.

DO $$
DECLARE
  tbl text;
BEGIN
  -- Delete from public tables in dependency order (leaves before roots)
  FOREACH tbl IN ARRAY ARRAY[
    'chat_messages',
    'chat_conversations',
    'notifications',
    'partner_invitations',
    'partner_access',
    'feedback',
    'parent_financial_checklist',
    'pediatrician_exports',
    'pediatrician_reminders',
    'allergen_exposure_logs',
    'allergen_introductions',
    'allergen_reactions',
    'diaper_logs',
    'feeding_logs',
    'sleep_logs',
    'illness_logs',
    'medication_logs',
    'supplement_logs',
    'speech_journal',
    'custom_milestones',
    'pumping_schedules',
    'children',
    'profiles'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE 'DELETE FROM public.' || quote_ident(tbl);
      RAISE NOTICE 'Deleted from public.%', tbl;
    ELSE
      RAISE NOTICE 'Skipped public.% (does not exist)', tbl;
    END IF;
  END LOOP;

  -- Remove auth users last
  DELETE FROM auth.users;
  RAISE NOTICE 'Deleted from auth.users';
END;
$$;
