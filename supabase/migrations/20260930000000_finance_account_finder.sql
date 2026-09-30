-- Finance Account Finder (specs/001-finance-account-finder, T001).
--
-- Adds three tables and one access helper:
--   child_finance_finder      — one row per child: the last finder answers
--   child_account_status      — one row per (child, account) the parent marked opened
--   finance_account_sponsors  — first-party sponsor config per account type (not child data)
--   can_manage_child_finance  — owner OR active co-parent of the child's owner
--
-- Plus a DB-level one-shot guard for the three finance reminder types that
-- check-notifications produces (see section 5).
--
-- The legacy finance tables (parent_financial_checklist,
-- financial_checklist_items, college_contributions) are NOT touched. The new
-- page simply stops reading them (Constitution IV: removal keeps data whole).
--
-- Deletion path: both child tables cascade from public.children(id).
-- _purge_user_data() deletes children by parent_id, so these rows go with
-- them; delete_user_account() / _purge_user_data() need no change.
-- finance_account_sponsors holds no user or child data.
--
-- Idempotent: CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY /
-- DROP TRIGGER IF EXISTS before re-create. A re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Access helper
-- ---------------------------------------------------------------------------
-- Finance is owner + co-parent only. Caregivers and viewers are excluded on
-- purpose (the role copy says "not finance"), which is why this does NOT
-- reuse can_access_child (any active partner) or can_write_child (coparent +
-- caregiver). Role and status literals verified against live on 2026-09-30:
-- partner_role enum = coparent | caregiver | viewer; status 'active'.
--
-- NOTE: deliberately does not call owner_has_plus(). The partner-seat gating
-- migration (20260828100000_partner_seats_flare_plus.sql) is not applied to
-- live as of 2026-09-30, so owner_has_plus() does not exist there. When that
-- migration lands, add `AND public.owner_has_plus(c.parent_id)` to the
-- co-parent branch below so finance access auto-suspends with every other
-- partner surface.
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
    )
  );
$$;

COMMENT ON FUNCTION public.can_manage_child_finance(uuid) IS
  'True when auth.uid() owns the child, or holds an active coparent '
  'partner_access row to the child''s owner. Caregivers and viewers are '
  'excluded (finance is not part of their role). Keyed on auth.uid() only, '
  'so it cannot be used to probe another user''s access.';

REVOKE EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_child_finance(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. child_finance_finder
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_finance_finder (
  child_id uuid PRIMARY KEY REFERENCES public.children(id) ON DELETE CASCADE,
  goal text NOT NULL,
  family_contributes boolean NOT NULL,
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_finance_finder_goal_check
    CHECK (goal IN ('education', 'anything', 'not_sure'))
);

COMMENT ON TABLE public.child_finance_finder IS
  'Last Account Finder answers per child (goal + whether family chips in). '
  'Shared by the owner and active co-parents. Cascade-deleted with children.';

-- ---------------------------------------------------------------------------
-- 3. child_account_status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_account_status (
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  account_key text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid NOT NULL DEFAULT auth.uid(),
  CONSTRAINT child_account_status_pkey PRIMARY KEY (child_id, account_key),
  CONSTRAINT child_account_status_account_key_check
    CHECK (account_key IN ('trump', '529', 'ugma_utma', 'hysa', 'esa', 'custodial_roth'))
);

COMMENT ON TABLE public.child_account_status IS
  'One row per (child, account type) the parent marked "I opened this". '
  'Undo = DELETE the row. Presence suppresses the matching finance reminder '
  'in check-notifications. Cascade-deleted with children.';

-- ---------------------------------------------------------------------------
-- 4. finance_account_sponsors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_account_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_key text NOT NULL,
  firm_name text NOT NULL,
  cta_label text NOT NULL,
  cta_url text NOT NULL,
  disclosure text,
  is_active boolean NOT NULL DEFAULT false,
  CONSTRAINT finance_account_sponsors_account_key_check
    CHECK (account_key IN ('trump', '529', 'ugma_utma', 'hysa', 'esa', 'custodial_roth')),
  CONSTRAINT finance_account_sponsors_cta_url_check
    CHECK (cta_url ~ '^https://')
);

-- One active sponsor per account type.
CREATE UNIQUE INDEX IF NOT EXISTS finance_account_sponsors_one_active_idx
  ON public.finance_account_sponsors (account_key)
  WHERE is_active;

COMMENT ON TABLE public.finance_account_sponsors IS
  'First-party sponsor for an account type ("Open with <firm>" + Ad label). '
  'Not child data. Authenticated users may read active rows only; writes are '
  'service-role / dashboard only. cta_url is used verbatim — the app must not '
  'append any user, child or device identifier (spec FR-016).';

-- ---------------------------------------------------------------------------
-- 5. Authorship stamping
-- ---------------------------------------------------------------------------
-- updated_by / marked_by must reflect the real actor, not a client-supplied
-- value (lessons-backend 2026-07-29: client-stamped authorship is forgeable).
-- A trigger overwrites them from auth.uid() on every write, so the client
-- never needs to send them and cannot spoof them. Falls back to the supplied
-- value only when auth.uid() is NULL (service role / dashboard).
CREATE OR REPLACE FUNCTION public.stamp_child_finance_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'child_finance_finder' THEN
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.updated_at := now();
  ELSIF TG_TABLE_NAME = 'child_account_status' THEN
    NEW.marked_by := COALESCE(auth.uid(), NEW.marked_by);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_child_finance_author() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.stamp_child_finance_author() FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_child_finance_author() FROM authenticated;

DROP TRIGGER IF EXISTS child_finance_finder_stamp_author ON public.child_finance_finder;
CREATE TRIGGER child_finance_finder_stamp_author
  BEFORE INSERT OR UPDATE ON public.child_finance_finder
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_finance_author();

DROP TRIGGER IF EXISTS child_account_status_stamp_author ON public.child_account_status;
CREATE TRIGGER child_account_status_stamp_author
  BEFORE INSERT OR UPDATE ON public.child_account_status
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_finance_author();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.child_finance_finder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_account_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_account_sponsors ENABLE ROW LEVEL SECURITY;

-- child_finance_finder — pivot on child_id (server-verifiable FK), never on
-- a client-supplied user column. UPDATE carries an explicit WITH CHECK so a
-- row cannot be moved to a child the caller can't manage.
DROP POLICY IF EXISTS child_finance_finder_select ON public.child_finance_finder;
CREATE POLICY child_finance_finder_select ON public.child_finance_finder
  FOR SELECT TO authenticated
  USING (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_finance_finder_insert ON public.child_finance_finder;
CREATE POLICY child_finance_finder_insert ON public.child_finance_finder
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_finance_finder_update ON public.child_finance_finder;
CREATE POLICY child_finance_finder_update ON public.child_finance_finder
  FOR UPDATE TO authenticated
  USING (public.can_manage_child_finance(child_id))
  WITH CHECK (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_finance_finder_delete ON public.child_finance_finder;
CREATE POLICY child_finance_finder_delete ON public.child_finance_finder
  FOR DELETE TO authenticated
  USING (public.can_manage_child_finance(child_id));

-- child_account_status
DROP POLICY IF EXISTS child_account_status_select ON public.child_account_status;
CREATE POLICY child_account_status_select ON public.child_account_status
  FOR SELECT TO authenticated
  USING (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_account_status_insert ON public.child_account_status;
CREATE POLICY child_account_status_insert ON public.child_account_status
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_account_status_update ON public.child_account_status;
CREATE POLICY child_account_status_update ON public.child_account_status
  FOR UPDATE TO authenticated
  USING (public.can_manage_child_finance(child_id))
  WITH CHECK (public.can_manage_child_finance(child_id));

DROP POLICY IF EXISTS child_account_status_delete ON public.child_account_status;
CREATE POLICY child_account_status_delete ON public.child_account_status
  FOR DELETE TO authenticated
  USING (public.can_manage_child_finance(child_id));

-- finance_account_sponsors — read active rows only; no client write policies
-- (RLS default-deny covers INSERT/UPDATE/DELETE).
DROP POLICY IF EXISTS finance_account_sponsors_select_active ON public.finance_account_sponsors;
CREATE POLICY finance_account_sponsors_select_active ON public.finance_account_sponsors
  FOR SELECT TO authenticated
  USING (is_active);

-- ---------------------------------------------------------------------------
-- 7. Grants (belt-and-braces on top of RLS)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.child_finance_finder FROM anon;
REVOKE ALL ON public.child_account_status FROM anon;
REVOKE ALL ON public.finance_account_sponsors FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_finance_finder TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_account_status TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.finance_account_sponsors FROM authenticated;
GRANT SELECT ON public.finance_account_sponsors TO authenticated;
GRANT ALL ON public.child_finance_finder TO service_role;
GRANT ALL ON public.child_account_status TO service_role;
GRANT ALL ON public.finance_account_sponsors TO service_role;

-- ---------------------------------------------------------------------------
-- 8. One-shot guard for finance reminders on public.notifications
-- ---------------------------------------------------------------------------
-- check-notifications dedupes finance_* types against ANY prior row for
-- (child_id, type). This pairs that app-level check with a DB-level one
-- (lessons-backend 2026-05-16): a BEFORE INSERT trigger that silently skips
-- (RETURN NULL) a second row for the same (child_id, type), so overlapping
-- cron runs cannot double-send. Returning NULL instead of raising keeps the
-- function's single batched insert from failing wholesale. Scoped by a WHEN
-- clause so every other notification type pays nothing.
CREATE INDEX IF NOT EXISTS notifications_finance_once_idx
  ON public.notifications (child_id, type)
  WHERE type IN ('finance_trump_claim', 'finance_529_newborn', 'finance_529_birthday');

CREATE OR REPLACE FUNCTION public.skip_duplicate_finance_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.child_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE child_id = NEW.child_id
      AND type = NEW.type
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM authenticated;

DROP TRIGGER IF EXISTS notifications_finance_once ON public.notifications;
CREATE TRIGGER notifications_finance_once
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type IN ('finance_trump_claim', 'finance_529_newborn', 'finance_529_birthday'))
  EXECUTE FUNCTION public.skip_duplicate_finance_notification();

-- ---------------------------------------------------------------------------
-- 9. Assertions — fail the migration rather than ship a silent gap
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['child_finance_finder', 'child_account_status', 'finance_account_sponsors'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'finance_account_finder: RLS not enabled on public.%', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'ALL') THEN
      RAISE EXCEPTION 'finance_account_finder: FOR ALL policy found on public.%', t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['child_finance_finder', 'child_account_status'] LOOP
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n <> 4 THEN
      RAISE EXCEPTION 'finance_account_finder: expected 4 policies on public.%, found %', t, n;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'finance_account_sponsors';
  IF n <> 1 THEN
    RAISE EXCEPTION 'finance_account_finder: expected 1 policy on finance_account_sponsors, found %', n;
  END IF;

  -- Both child tables must cascade from children so _purge_user_data covers them.
  SELECT count(*) INTO n FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.children'::regclass
    AND confdeltype = 'c'
    AND conrelid IN ('public.child_finance_finder'::regclass, 'public.child_account_status'::regclass);
  IF n <> 2 THEN
    RAISE EXCEPTION 'finance_account_finder: expected 2 ON DELETE CASCADE FKs to children, found %', n;
  END IF;
END;
$$;
