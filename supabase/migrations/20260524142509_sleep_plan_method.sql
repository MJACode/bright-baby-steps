-- Sleep Plan — method picker, chair-stage tracker, Ferber schedule + check-ins,
-- plus a DB-level safety guardrail for cry-tolerating methods under 16 weeks.
--
-- Why this migration exists:
--   - sleep_plans has no concept of "method" today, so all the coaching copy in
--     SleepPlanReminderBanner / NotificationBell is generic. The frontend plan
--     introduces a 6-method picker (Gentle Foundations, Pick-Up/Put-Down,
--     Chair, Ferber, Extinction, Fading) — we add the column and persist it.
--   - Chair method needs a 1..5 progression marker so ChairStageCard can render
--     the current stage; Ferber needs a per-night interval schedule so the
--     in-app countdown timer knows when to ping.
--   - ferber_check_ins is a dedicated audit row per scheduled check-in so the
--     timer can recover state if the parent backgrounds the app.
--   - The safety trigger enforces, at the DB layer, that the three
--     cry-tolerating methods (ferber / extinction / fading) are not selectable
--     for children under 16 weeks (112 days) chronological age. Mirrors the
--     AAP guidance and prevents a partner-write from bypassing the picker's
--     client-side gating.
--
-- All changes are idempotent: re-running this migration is a no-op.

-- =============================================================================
-- 1. Add method, chair_stage, ferber_schedule columns to sleep_plans
-- =============================================================================

ALTER TABLE public.sleep_plans
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'gentle_foundations';

ALTER TABLE public.sleep_plans
  ADD COLUMN IF NOT EXISTS chair_stage smallint;

ALTER TABLE public.sleep_plans
  ADD COLUMN IF NOT EXISTS ferber_schedule jsonb;

-- CHECK constraints — named explicitly so future migrations can target them
-- (lesson 2026-05-19: inline CHECKs auto-named as <table>_<column>_check are
-- harder to widen later; we name these up front).

ALTER TABLE public.sleep_plans
  DROP CONSTRAINT IF EXISTS sleep_plans_method_check;
ALTER TABLE public.sleep_plans
  ADD CONSTRAINT sleep_plans_method_check
  CHECK (method IN (
    'gentle_foundations',
    'pick_up_put_down',
    'chair',
    'ferber',
    'extinction',
    'fading'
  ));

ALTER TABLE public.sleep_plans
  DROP CONSTRAINT IF EXISTS sleep_plans_chair_stage_check;
ALTER TABLE public.sleep_plans
  ADD CONSTRAINT sleep_plans_chair_stage_check
  CHECK (chair_stage IS NULL OR (chair_stage BETWEEN 1 AND 5));

COMMENT ON COLUMN public.sleep_plans.method IS
  'One of gentle_foundations | pick_up_put_down | chair | ferber | extinction | fading. '
  'Drives banner / notification coaching copy and the optional Ferber/Chair UIs. '
  'Cry-tolerating methods (ferber, extinction, fading) are blocked under 16w by '
  'the enforce_sleep_method_safety trigger.';

COMMENT ON COLUMN public.sleep_plans.chair_stage IS
  'Chair method only. 1..5 progression marker (1 = bedside, 5 = out of room).';

COMMENT ON COLUMN public.sleep_plans.ferber_schedule IS
  'Ferber method only. Shape: { intervals: number[][] } — minutes per night, '
  'indexed by night_number - 1 (so intervals[0] is night 1). Default suggested '
  'by sleepMethods.ts is [[3,5,10],[5,10,12],[10,12,15]].';

-- =============================================================================
-- 2. ferber_check_ins audit table — recoverable countdown state
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ferber_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sleep_log_id uuid REFERENCES public.sleep_logs(id) ON DELETE CASCADE,
  night_number smallint NOT NULL,
  interval_index smallint NOT NULL,
  scheduled_at timestamptz NOT NULL,
  performed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ferber_check_ins_child_sleep_log
  ON public.ferber_check_ins (child_id, sleep_log_id);

CREATE INDEX IF NOT EXISTS idx_ferber_check_ins_parent_performed
  ON public.ferber_check_ins (parent_id, performed_at);

ALTER TABLE public.ferber_check_ins ENABLE ROW LEVEL SECURITY;

-- RLS mirrors sleep_plans (see 20260520010000_sleep_plans.sql comments):
--   SELECT  → has_partner_access (any active partner, including viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS ferber_check_ins_select ON public.ferber_check_ins;
CREATE POLICY ferber_check_ins_select
  ON public.ferber_check_ins
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS ferber_check_ins_insert ON public.ferber_check_ins;
CREATE POLICY ferber_check_ins_insert
  ON public.ferber_check_ins
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS ferber_check_ins_update ON public.ferber_check_ins;
CREATE POLICY ferber_check_ins_update
  ON public.ferber_check_ins
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS ferber_check_ins_delete ON public.ferber_check_ins;
CREATE POLICY ferber_check_ins_delete
  ON public.ferber_check_ins
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.ferber_check_ins IS
  'One row per scheduled Ferber check-in. Used by FerberCheckInTimer to '
  'recover countdown state across reloads / backgrounding. Cascade-deleted '
  'with children, auth.users, or sleep_logs.';

-- =============================================================================
-- 3. Safety trigger — block cry-tolerating methods under 16 weeks chronological
-- =============================================================================

-- Function returns the row unmodified on safe inputs, raises EXCEPTION on
-- unsafe ones. STABLE because it reads from children. SECURITY INVOKER is
-- fine: the policy on sleep_plans already gates who can write the row, and
-- the trigger fires regardless of which write-capable role (owner, coparent,
-- caregiver) is doing the write — partner-write cannot bypass it.

CREATE OR REPLACE FUNCTION public.enforce_sleep_method_safety()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_age_days int;
BEGIN
  -- Early-exit when the chosen method is safe at any age.
  IF NEW.method NOT IN ('ferber', 'extinction', 'fading') THEN
    RETURN NEW;
  END IF;

  SELECT (CURRENT_DATE - date_of_birth)
    INTO v_age_days
    FROM public.children
   WHERE id = NEW.child_id;

  IF v_age_days IS NULL THEN
    -- Child row missing — let the FK reject the write rather than masking it.
    RETURN NEW;
  END IF;

  IF v_age_days < 112 THEN
    RAISE EXCEPTION 'sleep_method_under_16w_unsafe'
      USING HINT = 'Cry-tolerating methods (ferber, extinction, fading) require '
                   'a chronological age of at least 16 weeks (112 days). '
                   'Pick gentle_foundations, pick_up_put_down, or chair instead.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sleep_method_safety_insert
  ON public.sleep_plans;
CREATE TRIGGER trg_enforce_sleep_method_safety_insert
  BEFORE INSERT ON public.sleep_plans
  FOR EACH ROW
  WHEN (NEW.method IN ('ferber', 'extinction', 'fading'))
  EXECUTE FUNCTION public.enforce_sleep_method_safety();

DROP TRIGGER IF EXISTS trg_enforce_sleep_method_safety_update
  ON public.sleep_plans;
CREATE TRIGGER trg_enforce_sleep_method_safety_update
  BEFORE UPDATE OF method ON public.sleep_plans
  FOR EACH ROW
  WHEN (NEW.method IN ('ferber', 'extinction', 'fading'))
  EXECUTE FUNCTION public.enforce_sleep_method_safety();

COMMENT ON FUNCTION public.enforce_sleep_method_safety() IS
  'BEFORE INSERT/UPDATE trigger on sleep_plans. Raises '
  '''sleep_method_under_16w_unsafe'' when the chosen method is one of '
  'ferber, extinction, fading AND the linked child is under 112 days old. '
  'Mirrors the client-side gating in src/lib/sleepMethods.ts so a partner '
  'write or direct SQL cannot bypass the safety guardrail.';
