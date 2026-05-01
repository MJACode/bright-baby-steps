-- Milestone Flagging Engine: Phase 1 Schema
-- Adds clinical flagging fields to speech (milestone) table
-- and creates milestone_flags to store per-child flag history.
--
-- DO NOT apply until seed data is approved by SLP co-founder.
-- The flag_at_months + flag_message columns drive the engine;
-- rows with NULL flag_at_months are tracking-only (no flag fired).

-- ─── Step 1: Add flagging columns to the speech table ─────────────────────────

ALTER TABLE public.speech
  ADD COLUMN IF NOT EXISTS flag_at_months   integer,
  ADD COLUMN IF NOT EXISTS flag_severity    text CHECK (flag_severity IN ('watch', 'concern', 'act')),
  ADD COLUMN IF NOT EXISTS flag_message     text,
  ADD COLUMN IF NOT EXISTS source           text,
  ADD COLUMN IF NOT EXISTS source_url       text;

-- ─── Step 2: milestone_flags — one row per child per milestone flag event ───────
-- Created when the engine detects flag_at_months has passed and skill is not achieved.
-- dismissed_at set when parent taps "I understand" / "Talk to doctor" etc.

CREATE TABLE IF NOT EXISTS public.milestone_flags (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  milestone_id      uuid        NOT NULL REFERENCES public.speech(id)   ON DELETE CASCADE,
  severity          text        NOT NULL CHECK (severity IN ('watch', 'concern', 'act')),
  first_flagged_at  date        NOT NULL DEFAULT CURRENT_DATE,
  last_evaluated_at date        NOT NULL DEFAULT CURRENT_DATE,
  dismissed_at      timestamptz,
  dismissed_reason  text,       -- 'acknowledged' | 'seeking_eval' | 'already_in_ei' | 'pediatrician_aware'
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, milestone_id)   -- one active flag per milestone per child
);

ALTER TABLE public.milestone_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own milestone flags"
  ON public.milestone_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id
        AND (c.parent_id = auth.uid() OR public.has_partner_access(auth.uid(), c.parent_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id
        AND (c.parent_id = auth.uid() OR public.has_partner_access(auth.uid(), c.parent_id))
    )
  );

CREATE INDEX IF NOT EXISTS idx_milestone_flags_child
  ON public.milestone_flags(child_id, dismissed_at NULLS FIRST);
