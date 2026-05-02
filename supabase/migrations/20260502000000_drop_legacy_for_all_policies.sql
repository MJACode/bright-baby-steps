-- Drop legacy FOR ALL policies that survived the RLS hardening loop because
-- their names didn't match the "Parents can manage own <table>" pattern.
-- Without this, viewers can still write through these permissive policies.

DROP POLICY IF EXISTS "Parents can manage own exposure logs" ON public.allergen_exposure_logs;
DROP POLICY IF EXISTS "Parents can manage own reaction logs" ON public.allergen_reactions;
DROP POLICY IF EXISTS "Parents can manage own child milestones" ON public.child_speech;
DROP POLICY IF EXISTS "Parents can manage own exports" ON public.pediatrician_exports;

-- Sanity check: should return zero rows.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'ALL'
  AND tablename = ANY (ARRAY[
    'children','feeding_logs','diaper_logs','sleep_logs','child_speech',
    'allergen_introductions','allergen_exposure_logs','allergen_reactions',
    'pediatrician_exports','illness_logs','medication_logs',
    'supplements','journal_entries','custom_milestones','reminders','milestone_flags'
  ]);
