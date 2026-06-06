-- Guided weekly speech-practice plans ("Speech Class") — one per child.
--
-- The Flare+ "Speech Class" feature turns the Word & Sound Journal into a
-- guided 7-day, slp-persona-authored practice program (built on the `drill`
-- skill format). This table is the rendered/editable plan the MilestonesPage
-- Speech Class card reads, plus the per-day check-off state the parent toggles.
--
-- Mirrors `20260520010000_sleep_plans.sql` exactly:
--   - one row per child (UNIQUE on child_id) — "regenerate" upserts on child_id
--   - `week_start` is the Monday of the active week; the card prompts a refresh
--     once it is more than 7 days old
--   - `plan` jsonb holds the SpeechClassPlan shape produced by the
--     `generate-speech-class` edge function (goal / ageCheck / oneRep /
--     dailyPlan / weekProgression / escalation / howToLog)
--   - `completed_days` is the set of day numbers (1..7) the parent has checked
--     off this week
--
-- Deletion path (same reasoning as sleep_plans):
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both run during `delete_user_account()` (children are deleted by parent_id,
-- and the final DELETE FROM auth.users cascades anyway), so this table does NOT
-- need its own line in that RPC.

CREATE TABLE IF NOT EXISTS public.speech_practice_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  week_start date NOT NULL,                          -- Monday of the active week
  plan jsonb NOT NULL,                               -- SpeechClassPlan shape
  completed_days smallint[] NOT NULL DEFAULT '{}',   -- day numbers checked off (1..7)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT speech_practice_plans_one_per_child UNIQUE (child_id)
);

-- parent_id index for "all plans owned by this user" scans. child_id is already
-- served by the UNIQUE constraint above.
CREATE INDEX IF NOT EXISTS idx_speech_practice_plans_parent
  ON public.speech_practice_plans (parent_id);

-- Reuse the existing public.update_updated_at() helper (defined in
-- 20260322213259_*.sql). Don't redefine it.
DROP TRIGGER IF EXISTS update_speech_practice_plans_updated_at ON public.speech_practice_plans;
CREATE TRIGGER update_speech_practice_plans_updated_at
  BEFORE UPDATE ON public.speech_practice_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.speech_practice_plans ENABLE ROW LEVEL SECURITY;

-- RLS mirrors sleep_plans:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS speech_practice_plans_select ON public.speech_practice_plans;
CREATE POLICY speech_practice_plans_select
  ON public.speech_practice_plans
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS speech_practice_plans_insert ON public.speech_practice_plans;
CREATE POLICY speech_practice_plans_insert
  ON public.speech_practice_plans
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS speech_practice_plans_update ON public.speech_practice_plans;
CREATE POLICY speech_practice_plans_update
  ON public.speech_practice_plans
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS speech_practice_plans_delete ON public.speech_practice_plans;
CREATE POLICY speech_practice_plans_delete
  ON public.speech_practice_plans
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.speech_practice_plans IS
  'Guided weekly speech-practice plan ("Speech Class"). One row per child '
  '(UNIQUE child_id). plan jsonb is the SpeechClassPlan from generate-speech-class; '
  'completed_days holds day numbers (1..7) checked off this week. '
  'Cascade-deleted with children or auth.users.';
