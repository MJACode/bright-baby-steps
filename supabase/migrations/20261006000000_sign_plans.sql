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
--   * week_start is the Monday of the plan week (planWeekStart on the client).
--     The one-plan-per-week limit (FR-020) is enforced by the edge function
--     BEFORE it calls Anthropic, by checking for a row with this week_start.
--   * plan jsonb is the sanitized SignPlan shape (weekStart / intro / focus /
--     stuck). It is server-generated from library slugs only; there is no
--     parent-entered free text in it (FR-021, FR-024). CHECK
--     sign_plans_plan_is_object keeps it a JSON object.
--   * Rows are written ONLY by the edge function, using the CALLER'S JWT (not
--     service role), so these policies are the write gate: a read-only viewer's
--     generate attempt fails here as well as in the UI. The client only reads.
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
--   DELETE  partner_can_write(parent_id)
-- Plain auth.uid() (not the `(select auth.uid())` initplan form) for parity
-- with child_signs / child_sign_practice.
--
-- Grants: none added; RLS is the gate (anon fails every policy: auth.uid() is
-- NULL). Same as child_sign_practice.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, guarded ADD CONSTRAINT,
-- CREATE INDEX IF NOT EXISTS, DROP TRIGGER/POLICY IF EXISTS + CREATE,
-- COMMENT is a replace.

CREATE TABLE IF NOT EXISTS public.sign_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,                 -- Monday of the plan week
  plan        jsonb       NOT NULL,                 -- SignPlan shape
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sign_plans_one_per_child UNIQUE (child_id),
  CONSTRAINT sign_plans_plan_is_object CHECK (jsonb_typeof(plan) = 'object')
);

-- Guard for a table created without the plan CHECK (CREATE TABLE IF NOT
-- EXISTS would skip the inline constraint). No-op once present.
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

DROP POLICY IF EXISTS sign_plans_delete ON public.sign_plans;
CREATE POLICY sign_plans_delete
  ON public.sign_plans
  FOR DELETE
  USING (public.partner_can_write(parent_id));

COMMENT ON TABLE public.sign_plans IS
  'Baby Signs weekly AI sign plan: one current row per child (UNIQUE child_id), '
  'replaced weekly by the generate-sign-plan edge function using the caller''s '
  'JWT. week_start is the plan-week Monday (one plan per child per week, '
  'enforced in the function). plan jsonb is the sanitized SignPlan built from '
  'library slugs only — Do NOT widen to parent free text (COPPA data '
  'minimization). parent_id is the child OWNER. Cascade-deleted with children '
  'or auth.users.';
