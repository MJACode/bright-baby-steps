-- Widen the `child_memories.source_function` CHECK constraint to allow a new
-- client-side write source: 'sleep-triage'.
--
-- Context: SleepPage is gaining a triage card that writes pain-point rows
-- straight into `child_memories` (category = 'concern' typically) from the
-- browser. Until now `source_function` was limited to the four AI-edge-fn
-- writers plus 'manual'. The triage card is a deliberate, narrow client write
-- path that deserves its own audit-trail value rather than being lumped under
-- 'manual'.
--
-- The original constraint in 20260516000000_child_memories.sql was declared
-- inline (no CONSTRAINT name) so Postgres auto-named it. Auto-name pattern for
-- inline column CHECKs is `<table>_<column>_check`, i.e.
-- `child_memories_source_function_check` — matches the precedent in
-- 20260517000000_widen_feeding_logs_check_constraints.sql
-- (feeding_logs_feeding_type_check etc.). Idempotent guards used throughout.
--
-- New allowlist: 'chat' | 'briefing' | 'weekly-insights' | 'manual' | 'sleep-triage'.

ALTER TABLE public.child_memories
  DROP CONSTRAINT IF EXISTS child_memories_source_function_check;

ALTER TABLE public.child_memories
  DROP CONSTRAINT IF EXISTS child_memories_source_function_v2_check;

ALTER TABLE public.child_memories
  ADD CONSTRAINT child_memories_source_function_v2_check
  CHECK (source_function IN ('chat','briefing','weekly-insights','manual','sleep-triage'));
