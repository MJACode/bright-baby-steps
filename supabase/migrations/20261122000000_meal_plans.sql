-- Food page restructure (Nov 2026, Phase A): per-child solids method + weekly
-- AI meal plans ("This week's meal plan" on the Solids tab).
--
-- Plan: tasks/todo.md "Food page restructure + AI meal plan — Nov 2026"
-- (founder-approved 2026-11-22). Modelled on 20261006030000_sign_plans.sql.
--
-- 1. children.solids_method
--   * Nullable text, CHECK children_solids_method_valid: NULL or one of
--     'blw' (baby-led weaning) / 'traditional' (spoon-fed purees) / 'mix'.
--     NULL = not asked yet; the Solids tab asks on first visit.
--   * No policy change needed. The live children UPDATE policy
--     (update_own_or_writer_children, checked on live 2026-11-22) is
--     USING / WITH CHECK (auth.uid() = parent_id OR partner_can_write(parent_id)),
--     so the owner and every coparent / caregiver within the owner's seat
--     entitlement can already set it; viewers can't. The only other UPDATE
--     trigger on children, protect_child_owner, pins id / parent_id only.
--   * It is a parent preference about feeding style, not new child data
--     shared with anyone; generate-meal-plan receives it as `method` in the
--     request body.
--
-- 2. public.meal_plans — a clone of sign_plans:
--   * One current plan per child (UNIQUE child_id). Each week the
--     generate-meal-plan edge function upserts on child_id, replacing last
--     week's plan.
--   * week_start is the Monday of the plan week (CHECK
--     meal_plans_week_start_is_monday). The one-plan-per-week limit is
--     enforced by the edge function BEFORE it calls Anthropic: it returns 409
--     when the stored row's week_start >= the requested week.
--   * Free tier: 1 plan per child, ever. The edge function lets a non-Flare+
--     caller generate only when NO meal_plans row exists for the child, so this
--     row is also the "free plan used" marker. That is only a limit because
--     the row can't be removed or reset through the API (below).
--   * plan jsonb is the sanitized MealPlan shape (weekStart / method / intro /
--     ideas[]), built server-side from model output after a deterministic
--     hazard + allergen filter. The request carries no name, DOB or parent
--     free text. CHECK meal_plans_plan_is_object keeps it a JSON object.
--   * Rows are written by generate-meal-plan using the CALLER'S JWT (not
--     service role), so these policies are the write gate: a read-only
--     viewer's generate attempt fails here as well as in the UI.
--   * The weekly limit and the free-plan marker are enforced HERE, not by
--     client discipline (lessons-backend 2026-10-06):
--       - no DELETE policy (delete the row -> weekly limit AND free plan reset);
--       - guard trigger meal_plans_guard_write (BEFORE INSERT OR UPDATE):
--         UPDATE must strictly advance week_start, child_id and parent_id are
--         immutable, and week_start may not be more than 1 day past today UTC
--         (pinning a year-3000 week would lock the family out forever).
--     Residual, accepted: a writer can INSERT (when no row exists) or advance
--     the row with arbitrary plan JSON through PostgREST. That skips the
--     server sanitizer but only reaches their own family (and spends their own
--     free plan); the client re-parses every stored plan through parseMealPlan.
--     Deleting and re-adding the child gives the new child its own free plan,
--     which is the intended "1 free plan per child".
--   * Deletion: child_id ON DELETE CASCADE (child removed) and parent_id ON
--     DELETE CASCADE from auth.users. delete_user_account() /
--     _purge_user_data(_uid) ends with DELETE FROM auth.users, which cascades
--     here (and via children), so no purge-order edit is needed — per the
--     2026-05-24 lesson, do NOT redefine delete_user_account() here. A Flare+
--     lapse deletes nothing.
--
-- RLS: owner-keyed (parent_id = the child's OWNER, never the writer), same as
-- sign_plans:
--   SELECT  auth.uid() = parent_id OR has_partner_access(auth.uid(), parent_id)
--   INSERT  partner_can_write(parent_id) AND child_id belongs to parent_id
--           (the EXISTS binding stops a stranger stamping their own uid as
--           parent_id for another family's child)
--   UPDATE  USING partner_can_write(parent_id) and WITH CHECK
--           partner_can_write(parent_id) + the same owner binding. WITH CHECK
--           is explicit, not left to the USING default. The upsert's ON
--           CONFLICT DO UPDATE path evaluates both.
--   DELETE  none. Child deletion (FK cascade) and account deletion
--           (SECURITY DEFINER purge ending in DELETE FROM auth.users) don't go
--           through RLS, so no client DELETE path is needed — and one would
--           reset both limits.
-- Plain auth.uid() (not the `(select auth.uid())` initplan form) for parity
-- with sign_plans.
--
-- Grants: none added. 20261009000000_default_table_privileges gives a new
-- public table SELECT/INSERT/UPDATE/DELETE for authenticated and nothing for
-- anon (same as sign_plans on live); RLS is the gate. The guard trigger
-- function has EXECUTE revoked from client roles (trigger firing does not
-- check EXECUTE).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, guarded
-- ADD CONSTRAINT, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER/POLICY IF EXISTS + CREATE (meal_plans_delete is dropped and
-- not recreated), COMMENT is a replace.

-- ---------------------------------------------------------------------------
-- 1. children.solids_method
-- ---------------------------------------------------------------------------

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS solids_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.children'::regclass
       AND conname = 'children_solids_method_valid'
  ) THEN
    ALTER TABLE public.children
      ADD CONSTRAINT children_solids_method_valid
      CHECK (solids_method IS NULL OR solids_method IN ('blw', 'traditional', 'mix'));
  END IF;
END $$;

COMMENT ON COLUMN public.children.solids_method IS
  'How this family offers solids: blw (baby-led weaning) | traditional '
  '(spoon-fed purees) | mix. NULL = not chosen yet. Drives the prep text in '
  'generate-meal-plan. Writable by the owner and partner_can_write partners '
  '(update_own_or_writer_children).';

-- ---------------------------------------------------------------------------
-- 2. public.meal_plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,                 -- Monday of the plan week
  plan        jsonb       NOT NULL,                 -- MealPlan shape
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_plans_one_per_child UNIQUE (child_id),
  CONSTRAINT meal_plans_plan_is_object CHECK (jsonb_typeof(plan) = 'object'),
  CONSTRAINT meal_plans_week_start_is_monday CHECK (extract(isodow FROM week_start) = 1)
);

-- Guard for a table created without the inline CHECKs (CREATE TABLE IF NOT
-- EXISTS would skip them). No-op once present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meal_plans'::regclass
       AND conname = 'meal_plans_one_per_child'
  ) THEN
    ALTER TABLE public.meal_plans
      ADD CONSTRAINT meal_plans_one_per_child UNIQUE (child_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meal_plans'::regclass
       AND conname = 'meal_plans_plan_is_object'
  ) THEN
    ALTER TABLE public.meal_plans
      ADD CONSTRAINT meal_plans_plan_is_object
      CHECK (jsonb_typeof(plan) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meal_plans'::regclass
       AND conname = 'meal_plans_week_start_is_monday'
  ) THEN
    ALTER TABLE public.meal_plans
      ADD CONSTRAINT meal_plans_week_start_is_monday
      CHECK (extract(isodow FROM week_start) = 1);
  END IF;
END $$;

-- Covers the parent_id FK (auth.users cascade) and the RLS parent_id filter.
-- child_id is already served by the UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_meal_plans_parent
  ON public.meal_plans (parent_id);

-- Reuse the existing public.update_updated_at() helper. Don't redefine it.
DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER update_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Write guard: backs the edge function's weekly limit and the free-plan
-- marker (see header). It fires on INSERT too (far-future check only — the
-- INSERT half of an upsert fires it with TG_OP = 'INSERT' before the conflict
-- turns it into an UPDATE, which then fires it again with OLD/NEW).
-- SECURITY INVOKER is enough: it only compares OLD/NEW and reads no tables.
-- Errors use check_violation (23514, PostgREST -> HTTP 400) with a stable
-- message the edge function branches on.
CREATE OR REPLACE FUNCTION public.meal_plans_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.week_start > (now() AT TIME ZONE 'UTC')::date + 1 THEN
    RAISE EXCEPTION 'meal_plan_week_too_far_ahead'
      USING ERRCODE = 'check_violation',
            DETAIL = 'week_start may be at most 1 day after today (UTC); the edge function only accepts the UTC Monday of now±1 day.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.child_id IS DISTINCT FROM OLD.child_id
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      RAISE EXCEPTION 'meal_plan_identity_immutable'
        USING ERRCODE = 'check_violation',
              DETAIL = 'child_id and parent_id cannot change on a meal plan.';
    END IF;
    IF NOT (NEW.week_start > OLD.week_start) THEN
      RAISE EXCEPTION 'meal_plan_week_must_advance'
        USING ERRCODE = 'check_violation',
              DETAIL = 'A meal plan can only be replaced by a later week''s plan.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger firing does not check EXECUTE; nobody needs to call this directly.
-- Revoke from anon/authenticated explicitly (REVOKE FROM PUBLIC alone was a
-- no-op on this project before 20261008020000; kept explicit for parity).
REVOKE EXECUTE ON FUNCTION public.meal_plans_guard_write() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order: meal_plans_guard_write runs before
-- update_meal_plans_updated_at, so a rejected write never reaches it.
DROP TRIGGER IF EXISTS meal_plans_guard_write ON public.meal_plans;
CREATE TRIGGER meal_plans_guard_write
  BEFORE INSERT OR UPDATE ON public.meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.meal_plans_guard_write();

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meal_plans_select ON public.meal_plans;
CREATE POLICY meal_plans_select
  ON public.meal_plans
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS meal_plans_insert ON public.meal_plans;
CREATE POLICY meal_plans_insert
  ON public.meal_plans
  FOR INSERT
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = meal_plans.child_id
         AND c.parent_id = meal_plans.parent_id
    )
  );

DROP POLICY IF EXISTS meal_plans_update ON public.meal_plans;
CREATE POLICY meal_plans_update
  ON public.meal_plans
  FOR UPDATE
  USING (public.partner_can_write(parent_id))
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = meal_plans.child_id
         AND c.parent_id = meal_plans.parent_id
    )
  );

-- No DELETE policy on purpose (see header). The DROP converges a database
-- that ran an earlier draft of this migration.
DROP POLICY IF EXISTS meal_plans_delete ON public.meal_plans;

COMMENT ON TABLE public.meal_plans IS
  'Solids weekly AI meal plan: one current row per child (UNIQUE child_id), '
  'replaced weekly by the generate-meal-plan edge function using the caller''s '
  'JWT. week_start is the plan-week Monday (one plan per child per week: the '
  'function 409s when stored week_start >= requested). The row''s existence is '
  'also the free-tier marker (1 free plan per child, ever). No DELETE policy and '
  'the meal_plans_guard_write trigger keep week_start moving forward only. plan '
  'jsonb is the sanitized, hazard-filtered MealPlan — Do NOT widen the request '
  'to parent free text (COPPA data minimization). parent_id is the child OWNER. '
  'Cascade-deleted with children or auth.users.';
