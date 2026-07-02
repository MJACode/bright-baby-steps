-- Misc topics for pediatrician visit prep.
--
-- Parents want to jot down observations about their child ("has been tugging
-- at her left ear", "new food aversion to purees") that surface alongside the
-- existing "questions to ask" entries at pediatrician visits. Rather than a
-- new table (which would also need wiring into the COPPA purge path —
-- pediatrician_reminders is already covered by _purge_user_data() /
-- delete_user_account()), we extend pediatrician_reminders with:
--
--   entry_type — 'question' (existing behavior, default) | 'topic' (new
--                parent-entered observation). Default keeps all existing
--                rows valid as questions.
--   category   — optional grouping for topics: behavior | feeding | sleep |
--                health | development | other. NULL allowed (uncategorized,
--                and all existing question rows).
--
-- RLS ("Parents can manage own reminders", FOR ALL with parent /
-- has_partner_access) and the updated_at trigger are row-level and already
-- cover the new columns — no policy or trigger changes needed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; CHECK constraints use the repo's
-- DROP CONSTRAINT IF EXISTS + explicitly-named ADD CONSTRAINT pattern
-- (prior art: 20260515000000_active_sessions.sql,
-- 20260517000000_widen_feeding_logs_check_constraints.sql).

ALTER TABLE public.pediatrician_reminders
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'question';

ALTER TABLE public.pediatrician_reminders
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.pediatrician_reminders
  DROP CONSTRAINT IF EXISTS pediatrician_reminders_entry_type_check;
ALTER TABLE public.pediatrician_reminders
  ADD CONSTRAINT pediatrician_reminders_entry_type_check
  CHECK (entry_type IN ('question', 'topic'));

ALTER TABLE public.pediatrician_reminders
  DROP CONSTRAINT IF EXISTS pediatrician_reminders_category_check;
ALTER TABLE public.pediatrician_reminders
  ADD CONSTRAINT pediatrician_reminders_category_check
  CHECK (category IS NULL OR category IN ('behavior', 'feeding', 'sleep', 'health', 'development', 'other'));

COMMENT ON COLUMN public.pediatrician_reminders.entry_type IS
  'question = something to ask the pediatrician (original feature); '
  'topic = parent-entered observation to mention at the visit.';

COMMENT ON COLUMN public.pediatrician_reminders.category IS
  'Optional grouping for topic entries: behavior | feeding | sleep | health '
  '| development | other. NULL for uncategorized rows and legacy questions.';
