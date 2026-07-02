-- Visit Prep AI — schema for the pediatrician visit-prep feature (Flare+ anchor,
-- with one free draft per visit for free users).
--
-- 1) pediatrician_reminders.source — distinguishes hand-typed reminders
--    ('manual') from AI-suggested questions the parent accepted
--    ('ai_suggested'). Accepted AI questions become ordinary reminder rows and
--    ride the existing include_in_report → PDF path unchanged. No RLS changes:
--    the column rides the existing "Parents can manage own reminders" FOR ALL
--    policy (auth.uid() = parent_id OR has_partner_access).
--
-- 2) visit_prep_drafts — one row per generated draft, written by the
--    visit-prep-questions edge function after each successful generation.
--    Free-tier gate: a non-premium user may generate only when NO row exists
--    for (user_id, child_id, visit_date). Premium users generate without
--    limit, so the index is intentionally NON-unique (multiple rows per
--    visit are legitimate for Flare+).
--
--    Purge path: user_id references auth.users ON DELETE CASCADE, so rows are
--    removed transitively by the final `DELETE FROM auth.users` in
--    _purge_user_data() (same pattern as voice_parse_events — see lessons
--    2026-05-24; do NOT redefine delete_user_account() here). child_id also
--    cascades from children for single-child deletion.
--
--    RLS: the edge function uses the caller's session client (anon key +
--    Authorization header), so the table needs explicit self-scoped
--    INSERT/SELECT policies. No UPDATE/DELETE policies — clients never mutate
--    the usage trail. No partner-access path: the draft counter is a
--    per-account entitlement record, not shared child data.

-- ─── Step 1: pediatrician_reminders.source ────────────────────────────────────

ALTER TABLE public.pediatrician_reminders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Explicitly named CHECK constraint (see lessons 2026-05-19: never rely on
-- auto-named inline constraints; name it so future widenings can target it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pediatrician_reminders_source_v1_check'
      AND conrelid = 'public.pediatrician_reminders'::regclass
  ) THEN
    ALTER TABLE public.pediatrician_reminders
      ADD CONSTRAINT pediatrician_reminders_source_v1_check
      CHECK (source IN ('manual', 'ai_suggested'));
  END IF;
END
$$;

-- ─── Step 2: visit_prep_drafts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.visit_prep_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visit_prep_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visit_prep_drafts'
      AND policyname = 'Users can insert own visit prep drafts'
  ) THEN
    CREATE POLICY "Users can insert own visit prep drafts"
      ON public.visit_prep_drafts FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visit_prep_drafts'
      AND policyname = 'Users can view own visit prep drafts'
  ) THEN
    CREATE POLICY "Users can view own visit prep drafts"
      ON public.visit_prep_drafts FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_visit_prep_drafts_user_child_visit
  ON public.visit_prep_drafts(user_id, child_id, visit_date);
