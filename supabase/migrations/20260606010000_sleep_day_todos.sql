-- Per-day sleep to-do checklist — one row per child per calendar day.
--
-- The sleep-todo feature renders a day-scoped checklist (derived from the
-- child's sleep plan + the day's wake anchor) that the parent toggles items on.
-- This table persists that per-day check-off state so it survives reloads and
-- syncs across the primary parent and any partners.
--
-- Mirrors `20260606000000_speech_practice_plans.sql` exactly for RLS helpers,
-- the update_updated_at trigger wiring, and column conventions. Differences:
--   - keyed one row per (child_id, plan_date) instead of one per child
--   - `wake_anchor` is the morning wake time the day's todos hang off of
--   - `completed_items` is the set of todo item ids the parent has checked off
--
-- Deletion path (same reasoning as speech_practice_plans / sleep_plans):
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both run during `delete_user_account()` (children are deleted by parent_id,
-- and the final DELETE FROM auth.users cascades anyway), so this table does NOT
-- need its own line in that RPC.

CREATE TABLE IF NOT EXISTS public.sleep_day_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  plan_date date NOT NULL,                            -- calendar day this checklist is for
  wake_anchor timestamptz,                            -- morning wake time the todos hang off of
  completed_items text[] NOT NULL DEFAULT '{}',       -- todo item ids checked off

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sleep_day_todos_one_per_child_day UNIQUE (child_id, plan_date)
);

-- parent_id index for "all todos owned by this user" scans. The (child_id,
-- plan_date) lookup is already served by the UNIQUE constraint above, so no
-- redundant helper index is added.
CREATE INDEX IF NOT EXISTS idx_sleep_day_todos_parent
  ON public.sleep_day_todos (parent_id);

-- Reuse the existing public.update_updated_at() helper (defined in
-- 20260322213259_*.sql). Don't redefine it.
DROP TRIGGER IF EXISTS update_sleep_day_todos_updated_at ON public.sleep_day_todos;
CREATE TRIGGER update_sleep_day_todos_updated_at
  BEFORE UPDATE ON public.sleep_day_todos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.sleep_day_todos ENABLE ROW LEVEL SECURITY;

-- RLS mirrors speech_practice_plans:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS sleep_day_todos_select ON public.sleep_day_todos;
CREATE POLICY sleep_day_todos_select
  ON public.sleep_day_todos
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS sleep_day_todos_insert ON public.sleep_day_todos;
CREATE POLICY sleep_day_todos_insert
  ON public.sleep_day_todos
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS sleep_day_todos_update ON public.sleep_day_todos;
CREATE POLICY sleep_day_todos_update
  ON public.sleep_day_todos
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS sleep_day_todos_delete ON public.sleep_day_todos;
CREATE POLICY sleep_day_todos_delete
  ON public.sleep_day_todos
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.sleep_day_todos IS
  'Per-day sleep to-do checklist. One row per child per calendar day '
  '(UNIQUE child_id, plan_date). wake_anchor is the morning wake the todos hang '
  'off of; completed_items holds the todo item ids checked off that day. '
  'Cascade-deleted with children or auth.users.';
