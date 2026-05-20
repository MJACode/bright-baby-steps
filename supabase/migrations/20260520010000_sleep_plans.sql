-- Structured sleep plans (one per child).
--
-- Replaces narrative-blob-into-`child_memories` as the source of truth for
-- "does this child have a saved plan?" The single one-line summary still gets
-- written into `child_memories(category='routine', source_function='sleep-triage')`
-- by `SleepPlanDialog` so the AI persona keeps its existing context channel —
-- this table is the rendered/editable plan the SleepPage CTA reads.
--
-- Columns hew to the constants in `src/lib/sleepPlan.ts`:
--   - `wake_window_low_min` / `wake_window_high_min` mirror WAKE_WINDOW_BY_BRACKET
--   - `total_sleep_low` / `total_sleep_high` mirror TOTAL_SLEEP_BY_BRACKET (hours)
--   - `nap_count` mirrors NAPS_BY_BRACKET (0..6 covers newborn → preschool)
--   - `bedtime_earliest` / `bedtime_latest` mirror BEDTIME_RANGE_BY_BRACKET
--   - `wake_time` is a HH:MM string (newborns and some 0-3mo plans skip it,
--     hence nullable)
--   - `bucket` is the `AgeBucket` literal (e.g. '6-9mo') from
--     src/lib/sleepTriage.ts; `bucket_label` is the human-readable version
--   - `overrides` jsonb is a free-form lock map (`{"wake": true,
--     "bedtime": false, ...}`) so the front-end can render lock icons and the
--     recompute path knows which tiles to leave alone
--
-- One plan per child (UNIQUE on child_id). Future schedule variants
-- (weekend vs. weekday, travel mode) would live in a separate table; we don't
-- model them yet.
--
-- Deletion path:
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both deletion paths run during `delete_user_account()` (children are deleted
-- by parent_id, and the final DELETE FROM auth.users cascades anyway), so this
-- table does NOT need its own line in that RPC. Adding it would be a no-op
-- but harmless; we leave it out to keep the RPC minimal.

CREATE TABLE IF NOT EXISTS public.sleep_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  wake_time text,                              -- HH:MM, e.g. '07:00' (nullable for newborns)
  bedtime_earliest text,                       -- HH:MM (nullable; 0-3mo skips bedtime)
  bedtime_latest text,                         -- HH:MM (nullable; 0-3mo skips bedtime)

  wake_window_low_min smallint,                -- minutes; matches WAKE_WINDOW_BY_BRACKET.lowMin
  wake_window_high_min smallint,               -- minutes; matches WAKE_WINDOW_BY_BRACKET.highMin

  nap_count smallint CHECK (nap_count IS NULL OR (nap_count >= 0 AND nap_count <= 6)),

  total_sleep_low smallint,                    -- hours per 24h
  total_sleep_high smallint,                   -- hours per 24h

  bucket text,                                 -- AgeBucket literal, e.g. '6-9mo'
  bucket_label text,                           -- e.g. '6-9 months'

  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sleep_plans_one_per_child UNIQUE (child_id)
);

-- parent_id index for "all plans owned by this user" scans (e.g. the
-- check-notifications edge function iterating plans to fan out reminders).
-- child_id is already served by the UNIQUE constraint above.
CREATE INDEX IF NOT EXISTS idx_sleep_plans_parent
  ON public.sleep_plans (parent_id);

-- Reuse the existing public.update_updated_at() helper (defined in
-- 20260322213259_*.sql). Don't redefine it.
DROP TRIGGER IF EXISTS update_sleep_plans_updated_at ON public.sleep_plans;
CREATE TRIGGER update_sleep_plans_updated_at
  BEFORE UPDATE ON public.sleep_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.sleep_plans ENABLE ROW LEVEL SECURITY;

-- RLS pattern mirrors sleep_logs / feeding_logs / diaper_logs after the
-- 20260501010000_harden_partner_role_rls.sql split:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write
-- WITH CHECK uses partner_can_write on the row's parent_id so a write-capable
-- partner can mutate the owner's row but the owner's parent_id remains the
-- canonical foreign key.

DROP POLICY IF EXISTS sleep_plans_select ON public.sleep_plans;
CREATE POLICY sleep_plans_select
  ON public.sleep_plans
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS sleep_plans_insert ON public.sleep_plans;
CREATE POLICY sleep_plans_insert
  ON public.sleep_plans
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS sleep_plans_update ON public.sleep_plans;
CREATE POLICY sleep_plans_update
  ON public.sleep_plans
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS sleep_plans_delete ON public.sleep_plans;
CREATE POLICY sleep_plans_delete
  ON public.sleep_plans
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.sleep_plans IS
  'Structured per-child sleep plan. One row per child (UNIQUE child_id). '
  'Mirrors the constants in src/lib/sleepPlan.ts; overrides jsonb is a lock '
  'map keyed by tile name. Cascade-deleted with children or auth.users.';
