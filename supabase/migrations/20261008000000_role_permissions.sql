-- Enforce partner roles on the 12 records tables and on child deletion.
--
-- WHAT WAS WRONG (confirmed on live 2026-10-08, read-only pg_policies)
-- --------------------------------------------------------------------
-- 1. Twelve tables still carry the 2026-04 single permissive policy
--      FOR ALL USING (auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id))
--    `has_partner_access` is true for every active, in-entitlement partner,
--    including role = 'viewer', and FOR ALL covers INSERT/UPDATE/DELETE. So a
--    View-only partner could edit and delete vaccinations, visits, insurance,
--    college savings, etc. Caregivers could read and write finance records.
--    Same policies also pivot on the client-supplied `parent_id`, which is the
--    self-satisfying / directional bug fixed for the log tables in
--    20260820000000_child_pivot_log_rls.sql: a row a partner wrote carries the
--    partner's uid, and the child's owner could not see it.
-- 2. `children` policy `delete_own_or_writer_children` uses partner_can_write,
--    so a caregiver (or co-parent) could delete the owner's child, which
--    cascades every record for that child.
-- 3. `can_manage_child_finance` (20260930000000) never got the free-plan seat
--    gate. Every other access helper calls `partner_within_entitlement`
--    (20260930100000), so a co-parent who is over the owner's seat limit lost
--    all access except finance. Moving more tables onto that helper without
--    fixing it would extend the leak, so it is fixed here.
--
-- APPROVED TARGET (founder, 2026-10-03, re-confirmed 2026-10-08)
-- ---------------------------------------------------------------
--   viewer    read only, no INSERT/UPDATE/DELETE anywhere
--   caregiver read + write on daily-care and health records, no finance
--   coparent  everything except team management (partner_access UPDATE/DELETE
--             is already owner-only: "Owners can update/delete partner access")
--   owner     everything; only the owner can delete a child
--
-- TIERS
-- -----
-- Care tier, reads: can_access_child (owner + any active in-entitlement
-- partner). Writes: can_write_child (owner + coparent + caregiver).
--   child_checklist_items, cry_analyses, dental_visits, ei_tracker,
--   pediatrician_visits, vaccinations, birth_certificates (child_id pivot)
--   ei_providers (pivots through ei_tracker_id -> ei_tracker.child_id)
--
-- Finance tier, reads AND writes: can_manage_child_finance (owner + coparent).
-- Same helper and same audience as the live Financial surface
-- (child_finance_finder, child_account_status), and FinancialTab.tsx already
-- tells caregivers and viewers "Finance is shared with parents and co-parents
-- only", so viewers lose read on these too, matching what the app shows them.
--   college_savings, life_insurance, health_insurance (child_id pivot)
--   college_contributions (pivots through savings_plan_id -> college_savings.child_id)
--
-- Grouping calls for the two tables the brief left open:
--   * birth_certificates -> CARE tier. Its only UI is the New Baby checklist
--     (BirthCertificateTab is opened from NewBabyChecklistTab, which also
--     reads certificate_number to tick the checklist item). It sits next to
--     child_checklist_items, not on the Financial surface.
--   * health_insurance -> FINANCE tier. It has no UI; in the schema it is an
--     insurance policy record alongside life_insurance (carrier, plan type,
--     member and group numbers, open-enrollment window, dependent-added
--     date), i.e. benefits enrollment, which the app treats as parent /
--     co-parent business. It is not on the Medical surface and caregivers
--     have no screen that needs it. Least privilege until a UI asks otherwise.
--
-- AUTHORSHIP
-- ----------
-- Same rule as 20260820000000: INSERT additionally requires
-- `parent_id = auth.uid()` so authorship cannot be forged; UPDATE does not,
-- so an owner can edit a partner-authored row. Every client write path for
-- these tables stamps the caller's uid (RecordsPage passes user.id as
-- parentId to MedicalTab / EarlyInterventionTab / NewBabyChecklistTab /
-- BirthCertificateForm; CryAnalyzer stamps userId). Upserts
-- (birth_certificates, ei_tracker, child_checklist_items) go through the
-- INSERT check with the caller's uid and the UPDATE check on conflict, both
-- satisfied by any writer.
--
-- ACCESS THIS WIDENS (deliberate, same as 20260820000000): the child's owner
-- (and partners) can now see rows a partner authored on the care tier, which
-- the directional parent_id pivot hid.
--
-- NOT CHANGED HERE: children INSERT / UPDATE (still owner or write-capable
-- partner), and the seven tables still on the parent_id pivot
-- (activity_plans, child_activities, ferber_check_ins, scheduled_visits,
-- sleep_day_todos, sleep_plans, speech_practice_plans) plus child_memories
-- (writes gated on can_access_child). Those are tracked separately.
--
-- Service-role edge functions and ON DELETE CASCADE bypass RLS, so the purge
-- paths (_purge_user_data, delete-account, inactive-account-purge) are not
-- affected. No new tables, so delete_user_account() needs no change.
--
-- Idempotent: helpers are CREATE OR REPLACE, every policy is dropped by both
-- its legacy name and its new name before it is created.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. can_manage_child_finance: add the free-plan seat gate.
-- ---------------------------------------------------------------------------
-- Same body as 20260930000000 plus partner_within_entitlement on the
-- co-parent branch, exactly as can_write_child / can_access_child do. The
-- 20260930000000 header asked for this gate once the plan gate landed.
CREATE OR REPLACE FUNCTION public.can_manage_child_finance(p_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE id = p_child_id AND parent_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.partner_access pa ON pa.owner_id = c.parent_id
      WHERE c.id = p_child_id
        AND pa.partner_id = auth.uid()
        AND pa.status = 'active'
        AND pa.role = 'coparent'
        AND public.partner_within_entitlement(c.parent_id, auth.uid())
    )
  );
$$;

COMMENT ON FUNCTION public.can_manage_child_finance(uuid) IS
  'True when auth.uid() owns the child, or holds an active, in-entitlement '
  'coparent partner_access row to the child''s owner. Caregivers and viewers '
  'are excluded (finance is not part of their role). Gates read and write on '
  'child_finance_finder, child_account_status, college_savings, '
  'college_contributions, life_insurance, health_insurance.';

-- pg_default_acl grants EXECUTE to anon on this project; revoking from PUBLIC
-- alone locks nothing (tasks/lessons-backend.md 2026-10-01).
REVOKE EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Drop the legacy FOR ALL policies by the exact names found on live
--    2026-10-08. The assertions in section 5 are the backstop.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Parents can manage own birth certificates"     ON public.birth_certificates;
DROP POLICY IF EXISTS "Parents can manage own child checklist items"  ON public.child_checklist_items;
DROP POLICY IF EXISTS "Parents can manage own college contributions"  ON public.college_contributions;
DROP POLICY IF EXISTS "Parents can manage own college savings"        ON public.college_savings;
DROP POLICY IF EXISTS "Parents can manage own cry analyses"           ON public.cry_analyses;
DROP POLICY IF EXISTS "Parents can manage own dental visits"          ON public.dental_visits;
DROP POLICY IF EXISTS "Parents can manage own EI providers"           ON public.ei_providers;
DROP POLICY IF EXISTS "Parents can manage own EI tracker"             ON public.ei_tracker;
DROP POLICY IF EXISTS "Parents can manage own health insurance"       ON public.health_insurance;
DROP POLICY IF EXISTS "Parents can manage own life insurance"         ON public.life_insurance;
DROP POLICY IF EXISTS "Parents can manage own pediatrician visits"    ON public.pediatrician_visits;
DROP POLICY IF EXISTS "Parents can manage own vaccinations"           ON public.vaccinations;

-- ---------------------------------------------------------------------------
-- 3. Create the per-command policies.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  care_direct    text[] := ARRAY['birth_certificates','child_checklist_items','cry_analyses',
                                 'dental_visits','ei_tracker','pediatrician_visits','vaccinations'];
  finance_direct text[] := ARRAY['college_savings','health_insurance','life_insurance'];
  read_expr  text;
  write_expr text;
  child_expr text;
  all_targets text[] := ARRAY['birth_certificates','child_checklist_items','college_contributions',
                              'college_savings','cry_analyses','dental_visits','ei_providers',
                              'ei_tracker','health_insurance','life_insurance',
                              'pediatrician_visits','vaccinations'];
BEGIN
  FOREACH t IN ARRAY all_targets LOOP
    IF t = ANY (care_direct) THEN
      read_expr  := 'public.can_access_child(auth.uid(), child_id)';
      write_expr := 'public.can_write_child(auth.uid(), child_id)';
    ELSIF t = ANY (finance_direct) THEN
      read_expr  := 'public.can_manage_child_finance(child_id)';
      write_expr := read_expr;
    ELSIF t = 'ei_providers' THEN
      child_expr := '(SELECT et.child_id FROM public.ei_tracker et WHERE et.id = ei_providers.ei_tracker_id)';
      read_expr  := format('public.can_access_child(auth.uid(), %s)', child_expr);
      write_expr := format('public.can_write_child(auth.uid(), %s)', child_expr);
    ELSIF t = 'college_contributions' THEN
      child_expr := '(SELECT cs.child_id FROM public.college_savings cs WHERE cs.id = college_contributions.savings_plan_id)';
      read_expr  := format('public.can_manage_child_finance(%s)', child_expr);
      write_expr := read_expr;
    ELSE
      RAISE EXCEPTION 'role_permissions: no tier for %', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_delete', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s)',
                   t || '_role_select', t, read_expr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s AND parent_id = auth.uid())',
                   t || '_role_insert', t, write_expr);
    -- Explicit WITH CHECK (same as USING) so a row cannot be moved to a child
    -- the actor cannot write to. No authorship clause on UPDATE, see header.
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
                   t || '_role_update', t, write_expr, write_expr);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (%s)',
                   t || '_role_delete', t, write_expr);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 4. children: only the owner can delete a child.
-- ---------------------------------------------------------------------------
-- DELETE USING reads the stored row, so parent_id here is the real owner, not
-- a client-supplied value.
DROP POLICY IF EXISTS delete_own_or_writer_children ON public.children;
DROP POLICY IF EXISTS delete_owner_only_children ON public.children;
CREATE POLICY delete_owner_only_children ON public.children
  FOR DELETE USING (auth.uid() = parent_id);

-- ---------------------------------------------------------------------------
-- 5. Assertions. Any failure rolls the whole migration back.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  targets text[] := ARRAY['birth_certificates','child_checklist_items','college_contributions',
                          'college_savings','cry_analyses','dental_visits','ei_providers',
                          'ei_tracker','health_insurance','life_insurance',
                          'pediatrician_visits','vaccinations'];
  finance text[] := ARRAY['college_contributions','college_savings','health_insurance','life_insurance'];
  bad text;
BEGIN
  -- 5a. Exactly 4 policies per target: one each of SELECT/INSERT/UPDATE/DELETE,
  --     and no FOR ALL (Postgres ORs permissive policies, so one leftover
  --     reopens everything).
  SELECT string_agg(format('%s(%s)', c.relname, coalesce(s.cmds, 'none')), ', ')
  INTO bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN LATERAL (
    SELECT string_agg(p.cmd, ',' ORDER BY p.cmd) AS cmds
    FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
  ) s ON true
  WHERE c.relname = ANY (targets) AND c.relkind = 'r'
    AND coalesce(s.cmds, '') <> 'DELETE,INSERT,SELECT,UPDATE';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: expected SELECT/INSERT/UPDATE/DELETE only, got %', bad;
  END IF;

  -- 5b. RLS must be on for every target.
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relname = ANY (targets) AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: RLS disabled on %', bad;
  END IF;

  -- 5c. No target policy may still use has_partner_access or partner_can_write
  --     (both pass viewers / pivot on parent_id).
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (targets)
    AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(has_partner_access|partner_can_write)';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: legacy helper still referenced by %', bad;
  END IF;

  -- 5d. Write policies outside finance must use can_write_child (never
  --     can_access_child, which admits viewers).
  SELECT string_agg(format('%s.%s', tablename, cmd), ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (targets) AND NOT tablename = ANY (finance)
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%can_write_child%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: care-tier write policy not on can_write_child: %', bad;
  END IF;

  -- 5e. Every finance-tier policy (read and write) uses can_manage_child_finance
  --     and nothing that admits caregivers or viewers.
  SELECT string_agg(format('%s.%s', tablename, cmd), ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (finance)
    AND ((coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%can_manage_child_finance%'
      OR (coalesce(qual, '') || coalesce(with_check, '')) ~ '(can_access_child|can_write_child)');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: finance-tier policy not owner/coparent-only: %', bad;
  END IF;

  -- 5f. Authorship on INSERT only.
  SELECT string_agg(tablename, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (targets) AND cmd = 'INSERT'
    AND with_check NOT LIKE '%parent_id = auth.uid()%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: INSERT authorship clause missing on %', bad;
  END IF;
  SELECT string_agg(tablename, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (targets) AND cmd = 'UPDATE'
    AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%parent_id = auth.uid()%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: authorship clause must be INSERT-only, found on UPDATE for %', bad;
  END IF;

  -- 5g. children: exactly one DELETE policy, owner-only.
  SELECT string_agg(format('%s: %s', policyname, qual), '; ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'children' AND cmd IN ('DELETE', 'ALL')
    AND NOT (cmd = 'DELETE' AND policyname = 'delete_owner_only_children'
             AND replace(replace(qual, '(', ''), ')', '') = 'auth.uid = parent_id');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: non-owner DELETE path on children: %', bad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'children' AND policyname = 'delete_owner_only_children') THEN
    RAISE EXCEPTION 'role_permissions aborted: delete_owner_only_children missing';
  END IF;

  -- 5h. can_manage_child_finance carries the seat gate and is not anon-callable.
  IF position('partner_within_entitlement' IN
       (SELECT prosrc FROM pg_proc WHERE oid = 'public.can_manage_child_finance(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'role_permissions aborted: can_manage_child_finance lacks partner_within_entitlement';
  END IF;
  IF has_function_privilege('anon', 'public.can_manage_child_finance(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'role_permissions aborted: anon can execute can_manage_child_finance';
  END IF;

  -- 5i. Catalog sweep (lessons 2026-08-29): no public table may keep a FOR ALL
  --     policy that admits partners via has_partner_access, the exact shape
  --     this migration removes (on live 2026-10-08 these 12 were the only
  --     ones). Catches anything a hand list missed.
  SELECT string_agg(format('%s.%s', p.tablename, p.policyname), ', ') INTO bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.cmd = 'ALL'
    AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) LIKE '%has_partner_access%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'role_permissions aborted: FOR ALL partner policy remains on %', bad;
  END IF;
END$$;
