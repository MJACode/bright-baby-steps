-- Baby Signs v2 (PR-D): weekly AI sign plans ("sign coach").
--
-- Spec: specs/001-baby-signs-v2 (data-model.md sign_plans, research R5-R7,
-- contracts/generate-sign-plan.md, FR-020..FR-027, FR-029).
--
-- Design:
--   * One current plan per child (UNIQUE child_id), mirroring
--     speech_practice_plans / activity_plans minus completed_days (practice
--     ticks in child_sign_practice already cover completion). Each week the
--     generate-sign-plan edge function upserts on child_id, replacing last
--     week's plan.
--   * week_start is the Monday of the plan week (planWeekStart on the client;
--     CHECK sign_plans_week_start_is_monday). The one-plan-per-week limit
--     (FR-020) is enforced by the edge function BEFORE it calls Anthropic: it
--     returns 409 when the stored row's week_start >= the requested week.
--   * plan jsonb is the sanitized SignPlan shape (weekStart / intro / focus /
--     stuck), built server-side from library slugs only; there is no
--     parent-entered free text in it (FR-021, FR-024). CHECK
--     sign_plans_plan_is_object keeps it a JSON object.
--   * Rows are written by the generate-sign-plan edge function using the
--     CALLER'S JWT (not service role), so these policies are the write gate: a
--     read-only viewer's generate attempt fails here as well as in the UI.
--   * That 409 is only as strong as this row. A writer can also reach the
--     table directly through PostgREST, so "one plan per week, only moving
--     forward, no client delete" is enforced HERE, not by client discipline:
--       - no DELETE policy (delete the row -> limit reset);
--       - guard trigger sign_plans_guard_write (BEFORE INSERT OR UPDATE):
--         UPDATE must strictly advance week_start (backdate -> limit reset;
--         same week -> a second paid generate for the week), child_id and
--         parent_id are immutable, and week_start may not be more than 1 day
--         past today UTC (pinning a year-3000 week would lock the family out
--         of generating forever).
--     Residual, accepted: a writer can still INSERT (when no row exists) or
--     advance the row with arbitrary plan JSON. That skips the server
--     sanitizer but only reaches their own family, and the client re-parses
--     every stored plan through parseSignPlan (library slugs only).
--   * Deletion: child_id ON DELETE CASCADE (child removed) and parent_id ON
--     DELETE CASCADE from auth.users. delete_user_account() /
--     _purge_user_data(_uid) ends with DELETE FROM auth.users, which cascades
--     here (and via children), so no purge-order edit is needed — per the
--     2026-05-24 lesson, do NOT redefine delete_user_account() here. A Flare+
--     lapse deletes nothing (FR-029).
--
-- RLS: owner-keyed (parent_id = the child's OWNER, never the writer), same as
-- child_signs / child_sign_practice:
--   SELECT  auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)
--           (every caregiver with access sees the current plan, FR-027)
--   INSERT  partner_can_write(parent_id) AND child_id belongs to parent_id
--           (the EXISTS binding stops a stranger stamping their own uid as
--           parent_id for another family's child)
--   UPDATE  USING partner_can_write(parent_id) (existing row is writable) and
--           WITH CHECK partner_can_write(parent_id) + the same owner binding
--           (the new row can't be re-pointed at another family's child or
--           owner). WITH CHECK is explicit, not left to the USING default.
--           The upsert's ON CONFLICT DO UPDATE path evaluates both.
--   DELETE  none. Child deletion (FK ON DELETE CASCADE) and account deletion
--           (delete_user_account / _purge_user_data, SECURITY DEFINER, ending
--           in DELETE FROM auth.users -> cascade) don't go through RLS, so no
--           client DELETE path is needed — and one would reset the weekly
--           limit.
-- Plain auth.uid() (not the `(select auth.uid())` initplan form) for parity
-- with child_signs / child_sign_practice.
--
-- Grants: none added; RLS is the gate (anon fails every policy: auth.uid() is
-- NULL). Same as child_sign_practice.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, guarded ADD CONSTRAINT,
-- CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER/POLICY IF EXISTS + CREATE (sign_plans_delete is dropped and
-- not recreated), COMMENT is a replace.

CREATE TABLE IF NOT EXISTS public.sign_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,                 -- Monday of the plan week
  plan        jsonb       NOT NULL,                 -- SignPlan shape
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sign_plans_one_per_child UNIQUE (child_id),
  CONSTRAINT sign_plans_plan_is_object CHECK (jsonb_typeof(plan) = 'object'),
  CONSTRAINT sign_plans_week_start_is_monday CHECK (extract(isodow FROM week_start) = 1)
);

-- Guard for a table created without the inline CHECKs (CREATE TABLE IF NOT
-- EXISTS would skip them). No-op once present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sign_plans'::regclass
       AND conname = 'sign_plans_plan_is_object'
  ) THEN
    ALTER TABLE public.sign_plans
      ADD CONSTRAINT sign_plans_plan_is_object
      CHECK (jsonb_typeof(plan) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sign_plans'::regclass
       AND conname = 'sign_plans_week_start_is_monday'
  ) THEN
    ALTER TABLE public.sign_plans
      ADD CONSTRAINT sign_plans_week_start_is_monday
      CHECK (extract(isodow FROM week_start) = 1);
  END IF;
END $$;

-- Covers the parent_id FK (auth.users cascade) and the RLS parent_id filter.
-- child_id is already served by the UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_sign_plans_parent
  ON public.sign_plans (parent_id);

-- Reuse the existing public.update_updated_at() helper (as
-- speech_practice_plans does). Don't redefine it.
DROP TRIGGER IF EXISTS update_sign_plans_updated_at ON public.sign_plans;
CREATE TRIGGER update_sign_plans_updated_at
  BEFORE UPDATE ON public.sign_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Write guard: backs the edge function's weekly limit (see header). It
-- fires on INSERT too (far-future check only — the
-- INSERT half of an upsert fires it with TG_OP = 'INSERT' before the conflict
-- turns it into an UPDATE, which then fires it again with OLD/NEW).
-- SECURITY INVOKER is enough: it only compares OLD/NEW and reads no tables.
-- Errors use check_violation (23514, PostgREST -> HTTP 400) with a stable
-- message the edge function can branch on.
CREATE OR REPLACE FUNCTION public.sign_plans_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.week_start > (now() AT TIME ZONE 'UTC')::date + 1 THEN
    RAISE EXCEPTION 'sign_plan_week_too_far_ahead'
      USING ERRCODE = 'check_violation',
            DETAIL = 'week_start may be at most 1 day after today (UTC); the edge function only accepts the UTC Monday of now±1 day.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.child_id IS DISTINCT FROM OLD.child_id
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      RAISE EXCEPTION 'sign_plan_identity_immutable'
        USING ERRCODE = 'check_violation',
              DETAIL = 'child_id and parent_id cannot change on a sign plan.';
    END IF;
    IF NOT (NEW.week_start > OLD.week_start) THEN
      RAISE EXCEPTION 'sign_plan_week_must_advance'
        USING ERRCODE = 'check_violation',
              DETAIL = 'A sign plan can only be replaced by a later week''s plan.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger firing does not check EXECUTE; nobody needs to call this directly.
-- pg_default_acl grants anon/authenticated EXECUTE explicitly on this
-- project, so revoking from PUBLIC alone would be a no-op.
REVOKE EXECUTE ON FUNCTION public.sign_plans_guard_write() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order: sign_plans_guard_write runs before
-- update_sign_plans_updated_at, so a rejected write never reaches it.
DROP TRIGGER IF EXISTS sign_plans_guard_write ON public.sign_plans;
CREATE TRIGGER sign_plans_guard_write
  BEFORE INSERT OR UPDATE ON public.sign_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sign_plans_guard_write();

ALTER TABLE public.sign_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sign_plans_select ON public.sign_plans;
CREATE POLICY sign_plans_select
  ON public.sign_plans
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS sign_plans_insert ON public.sign_plans;
CREATE POLICY sign_plans_insert
  ON public.sign_plans
  FOR INSERT
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = sign_plans.child_id
         AND c.parent_id = sign_plans.parent_id
    )
  );

DROP POLICY IF EXISTS sign_plans_update ON public.sign_plans;
CREATE POLICY sign_plans_update
  ON public.sign_plans
  FOR UPDATE
  USING (public.partner_can_write(parent_id))
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = sign_plans.child_id
         AND c.parent_id = sign_plans.parent_id
    )
  );

-- No DELETE policy on purpose (see header). The DROP converges a database
-- that ran an earlier draft of this migration.
DROP POLICY IF EXISTS sign_plans_delete ON public.sign_plans;

COMMENT ON TABLE public.sign_plans IS
  'Baby Signs weekly AI sign plan: one current row per child (UNIQUE child_id), '
  'replaced weekly by the generate-sign-plan edge function using the caller''s '
  'JWT. week_start is the plan-week Monday (one plan per child per week: the '
  'function 409s when stored week_start >= requested; no DELETE policy and the '
  'sign_plans_guard_write trigger keep week_start moving forward only). plan jsonb is the sanitized SignPlan built from '
  'library slugs only — Do NOT widen to parent free text (COPPA data '
  'minimization). parent_id is the child OWNER. Cascade-deleted with children '
  'or auth.users.';
