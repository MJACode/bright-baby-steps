-- Repoint log-table RLS from the client-supplied `parent_id` to `child_id`,
-- and constrain `parent_id` to the caller's own uid on INSERT.
--
-- This migration does THREE things:
--   (1) repoints the access pivot from `parent_id` to `child_id`,
--   (2) closes the viewer-can-write hole that (1) exposes on 16 tables and that
--       has been open on the 3 never-hardened Group C tables all along,
--   (3) constrains authorship on INSERT so `parent_id` cannot be forged.
--
-- WHY (1) AND (2)
-- ---------------
-- Every client write path stamps `parent_id: user.id` (QuickLogFAB,
-- useActiveSleep, useActiveFeed, useVoiceLog, IllnessSection). Pivoting the
-- policies on that client-supplied value produces two bugs:
--
--   1. Writes are not role-enforced. The hardened WITH CHECK reads
--      `(auth.uid() = parent_id) OR partner_can_write(parent_id)`. Because the
--      client supplies its own uid, the first disjunct is ALWAYS true, so
--      `partner_can_write` — the clause that excludes read-only viewers — never
--      runs. A viewer can write to every hardened log table today.
--
--   2. Partner-written rows are invisible to the child's owner. The USING
--      clause reads `(auth.uid() = parent_id) OR has_partner_access(auth.uid(),
--      parent_id)`, but `has_partner_access` is strictly directional
--      (20260329214509:35-48) and `accept_partner_invitation`
--      (20260507020000:48) inserts exactly ONE row (owner_id, partner_id).
--      So owner -> partner resolves, partner -> owner does not: rows a partner
--      logs carry parent_id = partner uid and the owner cannot see them.
--
-- The fix is to pivot on `child_id`, which is server-verifiable against
-- `public.children`, using the existing `can_access_child` helper for reads and
-- a new `can_write_child` helper for writes.
--
-- WHY (3) — authorship is load-bearing, so it must be constrained
-- ---------------------------------------------------------------
-- `parent_id` IS NOT CHANGED AND IS NOT DROPPED. It doubles as authorship —
-- `useLoggedByNames.ts` resolves it to "logged by" names for LoggedByChip,
-- FeedingLog, EventDetailsPopover, SleepPage and DiapersPage.
--
-- Pivoting solely on `child_id` would leave `parent_id` entirely unconstrained
-- by policy, so any authenticated user who can write to a child could stamp an
-- arbitrary uid as the author and forge the "logged by" label. That widening is
-- introduced by THIS migration (before it, a writer was at least confined to
-- their own uid or the owner's), so it is closed here rather than deferred:
--
--     INSERT WITH CHECK (can_write_child(auth.uid(), child_id)
--                        AND parent_id = auth.uid())
--
-- INSERT ONLY, deliberately. The clause is NOT added to UPDATE: an owner
-- editing a partner-authored row must not be forced to rewrite authorship to
-- themselves, and adding it to UPDATE would make partner-authored rows
-- uneditable by the owner entirely. UPDATE therefore keeps plain
-- `can_write_child` on both USING and WITH CHECK, which still prevents moving a
-- row to a child the actor cannot write to.
--
-- Safe against every live write path: all of them stamp the caller's own uid
-- (QuickLogFAB:258,356,482; useActiveSleep:88; useActiveFeed:119;
-- useVoiceLog:111,143,161,178,195; IllnessSection). Edge functions using the
-- service-role key bypass RLS entirely, and the seed insert in 20260404194346
-- runs as superuser, so neither is affected.
--
-- `weight_logs` is EXEMPT from the authorship clause because it has no
-- `parent_id` column at all (see the widening note below). The create loop
-- therefore branches per table on column presence; the other 16 are uniform.
--
-- There is no data migration; live rows have zero orphans
-- (`child_id IS NULL OR NOT IN (SELECT id FROM children)` returns 0 rows on
-- every table below).
--
-- SCOPE — 17 tables, all confirmed to have `child_id`:
--   Group A (13) — standard hardened 4-policy naming from
--     20260501010000_harden_partner_role_rls.sql
--   Group B (1)  — child_leaps, per-verb but named <table>_<verb>
--   Group C (3)  — temperature_logs, pediatrician_reminders, weight_logs;
--     never hardened, still on a single permissive FOR ALL policy (so viewers
--     can write to these TODAY, independent of the parent_id bug).
--
-- EXPLICITLY OUT OF SCOPE:
--   * `public.children` — its key is `id`, it has no `child_id`. Its policies
--     are left alone.
--   * `caregiver_notes`.
--   * `journal_entries` and `reminders` — these DO NOT EXIST. The 20260501010000
--     harden loop's `to_regclass` guard silently skipped them.
--   * `has_partner_access` and `partner_can_write` are NOT modified; other
--     callers (children, sleep_plans, scheduled_visits, cry_analyses,
--     child_checklist_items, speech_practice_plans, sleep_day_todos,
--     activity_plans, child_activities) still depend on them.
--
-- INTENTIONAL ACCESS WIDENING — weight_logs
-- -----------------------------------------
-- `weight_logs` has `child_id` but NO `parent_id` column, and its FOR ALL
-- policy (20260425000001_weight_tracking.sql:17-30) was already child-pivoted
-- but OWNER-ONLY:
--     EXISTS (SELECT 1 FROM children c
--             WHERE c.id = child_id AND c.parent_id = auth.uid())
-- Partners therefore have NO access to growth data today. Converting it to the
-- shared helpers WIDENS access: partners will now read growth data, and
-- write-capable partners (coparent / caregiver) will now be able to record
-- weights. This is deliberate and makes weight_logs consistent with every other
-- log table — recording it here so it is a decided change and not a silent
-- side effect. Viewers still cannot write.
-- `weight_logs` also loses its explicit `TO authenticated` clause so all 17
-- tables share one policy shape. This is functionally a no-op: `auth.uid()` is
-- NULL for the anon role, so both disjuncts inside the helpers are false.
--
-- Idempotent: re-running is a no-op (drops by both the legacy names and the new
-- names before creating).

-- ---------------------------------------------------------------------------
-- 1. can_write_child()
-- ---------------------------------------------------------------------------
-- Mirrors `can_access_child` (20260322205923:71) in style — LANGUAGE sql,
-- STABLE, SECURITY DEFINER, SET search_path = public — but restricts partners
-- to the write-capable role set encoded by `partner_can_write`
-- (20260429050000:95-107): owner + coparent + caregiver. Viewers are excluded.
-- The role list is deliberately copied from `partner_can_write` rather than
-- reinvented; if that set ever changes, both must change together.
--
-- The leading `_user_id = auth.uid()` self-check is the same guard
-- `has_partner_access` grew in 20260329214509:42, for the same reason: this is
-- a SECURITY DEFINER function callable directly over PostgREST, so without it
-- any authenticated user could probe another user's write access to an
-- arbitrary child id.
CREATE OR REPLACE FUNCTION public.can_write_child(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE id = _child_id AND parent_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.partner_access pa ON pa.owner_id = c.parent_id
      WHERE c.id = _child_id
        AND pa.partner_id = _user_id
        AND pa.status = 'active'
        AND pa.role IN ('coparent', 'caregiver')
    )
  )
$$;

COMMENT ON FUNCTION public.can_write_child(uuid, uuid) IS
  'True when _user_id owns _child_id, or holds an active write-capable '
  'partner_access row (coparent | caregiver, never viewer) to that child''s '
  'owner. Write-side counterpart to can_access_child(). Role set mirrors '
  'partner_can_write(); keep the two in sync. Guarded by _user_id = auth.uid() '
  'so it cannot be used to probe another user''s access.';

-- ---------------------------------------------------------------------------
-- 2. Drop the OLD policies by their exact names, per group.
-- ---------------------------------------------------------------------------
-- Drop-by-name is deliberate. The three groups use three different naming
-- conventions, and Postgres ORs permissive policies together — a single
-- leftover permissive FOR ALL policy on ANY of these tables would re-open the
-- exact hole this migration closes. A blind `DROP POLICY IF EXISTS` using only
-- the Group A pattern would silently leave Group B and Group C policies in
-- place and the migration would appear to succeed while changing nothing on
-- four tables. The tail assertion in section 4 is the backstop.

-- 2a. Group A — 13 tables on the hardened 4-policy naming.
DO $$
DECLARE
  t text;
  group_a text[] := ARRAY[
    'allergen_exposure_logs',
    'allergen_introductions',
    'allergen_reactions',
    'child_speech',
    'custom_milestones',
    'diaper_logs',
    'feeding_logs',
    'illness_logs',
    'medication_logs',
    'milestone_flags',
    'pediatrician_exports',
    'sleep_logs',
    'supplements'
  ];
BEGIN
  FOREACH t IN ARRAY group_a LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'can_write_child migration: skipping missing table public.%', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'select_own_or_partner_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'insert_own_or_writer_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'update_own_or_writer_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'delete_own_or_writer_' || t, t);
  END LOOP;
END$$;

-- 2b. Group B — child_leaps (20260610000000_child_leaps.sql:60-83), already
-- per-verb but on the <table>_<verb> naming and the same broken parent_id pivot.
DO $$
BEGIN
  IF to_regclass('public.child_leaps') IS NOT NULL THEN
    DROP POLICY IF EXISTS child_leaps_select ON public.child_leaps;
    DROP POLICY IF EXISTS child_leaps_insert ON public.child_leaps;
    DROP POLICY IF EXISTS child_leaps_update ON public.child_leaps;
    DROP POLICY IF EXISTS child_leaps_delete ON public.child_leaps;
  END IF;
END$$;

-- 2c. Group C — three tables still on a single permissive FOR ALL policy.
-- These were never hardened, so dropping them also closes the viewer-can-write
-- hole that exists on them today independently of the parent_id pivot.
DO $$
BEGIN
  -- 20260624000000_temperature_logs.sql:29
  IF to_regclass('public.temperature_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Parents can manage own temperature logs" ON public.temperature_logs;
  END IF;
  -- 20260404182115:15
  IF to_regclass('public.pediatrician_reminders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Parents can manage own reminders" ON public.pediatrician_reminders;
  END IF;
  -- 20260425000001_weight_tracking.sql:17
  IF to_regclass('public.weight_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can manage own weight logs" ON public.weight_logs;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. Create the new child-pivoted policies on all 17 tables.
-- ---------------------------------------------------------------------------
--   SELECT                          -> can_access_child (any active partner,
--                                      including read-only viewers)
--   INSERT / UPDATE / DELETE        -> can_write_child  (owner, coparent,
--                                      caregiver only)
--   INSERT additionally             -> AND parent_id = auth.uid()  (authorship)
--
-- UPDATE carries an explicit WITH CHECK identical to its USING so a row cannot
-- be moved to a child the actor cannot write to. UPDATE deliberately OMITS the
-- authorship clause so an owner can edit a partner-authored row without being
-- forced to rewrite its author — see the header note on (3).
DO $$
DECLARE
  t text;
  has_parent_id boolean;
  insert_check text;
  authorship_applied int := 0;
  authorship_exempt int := 0;
  all_tables text[] := ARRAY[
    -- Group A
    'allergen_exposure_logs',
    'allergen_introductions',
    'allergen_reactions',
    'child_speech',
    'custom_milestones',
    'diaper_logs',
    'feeding_logs',
    'illness_logs',
    'medication_logs',
    'milestone_flags',
    'pediatrician_exports',
    'sleep_logs',
    'supplements',
    -- Group B
    'child_leaps',
    -- Group C
    'temperature_logs',
    'pediatrician_reminders',
    'weight_logs'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'can_write_child migration: skipping missing table public.%', t;
      CONTINUE;
    END IF;

    -- Re-run safety: drop the NEW names too, so this migration is idempotent
    -- even after the legacy names are long gone.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'select_child_access_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'insert_child_write_'  || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'update_child_write_'  || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'delete_child_write_'  || t, t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT
        USING (public.can_access_child(auth.uid(), child_id))
    $f$, 'select_child_access_' || t, t);

    -- Per-table branch: only tables that actually HAVE a parent_id column get
    -- the authorship clause. Today that is 16 of 17 — `weight_logs` is the sole
    -- exemption because it has no parent_id (20260425000001_weight_tracking.sql).
    -- Detected from the catalog rather than hardcoded so this cannot drift if
    -- another parent_id-less table joins the list later.
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass(format('public.%I', t))
        AND a.attname = 'parent_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO has_parent_id;

    IF has_parent_id THEN
      insert_check := 'public.can_write_child(auth.uid(), child_id) AND parent_id = auth.uid()';
      authorship_applied := authorship_applied + 1;
    ELSE
      insert_check := 'public.can_write_child(auth.uid(), child_id)';
      authorship_exempt := authorship_exempt + 1;
      RAISE NOTICE
        'can_write_child migration: public.% has no parent_id column, INSERT authorship clause omitted', t;
    END IF;

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR INSERT
        WITH CHECK (%s)
    $f$, 'insert_child_write_' || t, t, insert_check);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR UPDATE
        USING (public.can_write_child(auth.uid(), child_id))
        WITH CHECK (public.can_write_child(auth.uid(), child_id))
    $f$, 'update_child_write_' || t, t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR DELETE
        USING (public.can_write_child(auth.uid(), child_id))
    $f$, 'delete_child_write_' || t, t);

    -- Group C tables were never hardened; make sure RLS is actually on.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  RAISE NOTICE
    'can_write_child migration: INSERT authorship clause applied to % tables, % exempt (no parent_id column)',
    authorship_applied, authorship_exempt;
END$$;

-- ---------------------------------------------------------------------------
-- 4. Sanity check / assertion.
-- ---------------------------------------------------------------------------
-- Same intent as the trailing SELECT in 20260501010000, but as a hard
-- assertion: a silent partial apply here is a security regression, and a
-- RAISE EXCEPTION rolls the whole migration back to the (known) prior state.
DO $$
DECLARE
  targets text[] := ARRAY[
    'allergen_exposure_logs','allergen_introductions','allergen_reactions',
    'child_speech','custom_milestones','diaper_logs','feeding_logs',
    'illness_logs','medication_logs','milestone_flags','pediatrician_exports',
    'sleep_logs','supplements','child_leaps','temperature_logs',
    'pediatrician_reminders','weight_logs'
  ];
  leftovers text;
  wrong_count text;
  missing_authorship text;
  stray_authorship text;
BEGIN
  -- 4a. No permissive FOR ALL policy may survive on any target table.
  --     Postgres ORs permissive policies, so one leftover defeats everything.
  SELECT string_agg(format('%s.%s', tablename, policyname), ', ')
  INTO leftovers
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'ALL'
    AND tablename = ANY (targets);

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION
      'child-pivot RLS migration aborted: leftover FOR ALL policies remain: %',
      leftovers;
  END IF;

  -- 4b. Every target table that exists must have exactly 4 policies.
  SELECT string_agg(format('%s(%s)', tbl, n), ', ')
  INTO wrong_count
  FROM (
    SELECT c.relname AS tbl,
           (SELECT count(*) FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS n
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relname = ANY (targets)
  ) s
  WHERE n <> 4;

  IF wrong_count IS NOT NULL THEN
    RAISE EXCEPTION
      'child-pivot RLS migration aborted: expected exactly 4 policies per table, got %',
      wrong_count;
  END IF;

  -- 4c. The helper must exist (guards against a partial apply of section 1).
  IF to_regprocedure('public.can_write_child(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'child-pivot RLS migration aborted: can_write_child(uuid,uuid) is missing';
  END IF;

  -- 4d. Every target table that HAS a parent_id column must carry the
  --     authorship clause on its INSERT policy. Catches a per-table branch
  --     that silently fell through and left authorship forgeable.
  SELECT string_agg(p.tablename, ', ')
  INTO missing_authorship
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd = 'INSERT'
    AND p.tablename = ANY (targets)
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', p.tablename)::regclass
        AND a.attname = 'parent_id' AND a.attnum > 0 AND NOT a.attisdropped
    )
    AND p.with_check NOT LIKE '%parent_id = auth.uid()%';

  IF missing_authorship IS NOT NULL THEN
    RAISE EXCEPTION
      'child-pivot RLS migration aborted: INSERT authorship clause missing on: %',
      missing_authorship;
  END IF;

  -- 4e. The authorship clause must NOT appear on UPDATE. If it does, an owner
  --     can no longer edit a partner-authored row without rewriting its author,
  --     which breaks editing partner-authored rows entirely.
  SELECT string_agg(p.tablename, ', ')
  INTO stray_authorship
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd = 'UPDATE'
    AND p.tablename = ANY (targets)
    AND (p.with_check LIKE '%parent_id = auth.uid()%'
      OR p.qual       LIKE '%parent_id = auth.uid()%');

  IF stray_authorship IS NOT NULL THEN
    RAISE EXCEPTION
      'child-pivot RLS migration aborted: authorship clause must be INSERT-only, found on UPDATE for: %',
      stray_authorship;
  END IF;
END$$;

-- Informational: final policy inventory for the 17 tables.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'allergen_exposure_logs','allergen_introductions','allergen_reactions',
    'child_speech','custom_milestones','diaper_logs','feeding_logs',
    'illness_logs','medication_logs','milestone_flags','pediatrician_exports',
    'sleep_logs','supplements','child_leaps','temperature_logs',
    'pediatrician_reminders','weight_logs'
  ])
ORDER BY tablename, cmd, policyname;
