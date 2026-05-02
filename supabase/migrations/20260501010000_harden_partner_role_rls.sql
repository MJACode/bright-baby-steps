-- Harden RLS so viewers can read but not write.
-- Splits each "FOR ALL" log-table policy into:
--   SELECT  → has_partner_access (any active partner)
--   INSERT/UPDATE/DELETE → partner_can_write (owner, coparent, caregiver only)

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'children',
    'feeding_logs',
    'diaper_logs',
    'sleep_logs',
    'child_speech',
    'allergen_introductions',
    'allergen_exposure_logs',
    'allergen_reactions',
    'pediatrician_exports',
    'illness_logs',
    'medication_logs',
    'supplements',
    'journal_entries',
    'custom_milestones',
    'reminders',
    'milestone_flags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip tables that don't exist in this database
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    -- Drop legacy "FOR ALL" policies (various naming conventions across migrations)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
      'Parents can manage own ' || replace(t, '_', ' '), t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
      'Users can manage own ' || replace(t, '_', ' '), t);

    -- SELECT: any active partner can read
    EXECUTE format($f$
      CREATE POLICY "select_own_or_partner_%s" ON public.%I
        FOR SELECT
        USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id))
    $f$, t, t);

    -- INSERT: owner + write-capable partners only
    EXECUTE format($f$
      CREATE POLICY "insert_own_or_writer_%s" ON public.%I
        FOR INSERT
        WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id))
    $f$, t, t);

    -- UPDATE: owner + write-capable partners only
    EXECUTE format($f$
      CREATE POLICY "update_own_or_writer_%s" ON public.%I
        FOR UPDATE
        USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
        WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id))
    $f$, t, t);

    -- DELETE: owner + write-capable partners only
    EXECUTE format($f$
      CREATE POLICY "delete_own_or_writer_%s" ON public.%I
        FOR DELETE
        USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
    $f$, t, t);
  END LOOP;
END$$;

-- Sanity check: after running, this should return zero rows.
-- Any remaining FOR ALL policies on these tables indicate incomplete coverage.
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
