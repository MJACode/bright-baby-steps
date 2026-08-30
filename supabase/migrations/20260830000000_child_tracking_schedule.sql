-- Custom tracking schedule — per-child day boundary + night boundary.
--
-- Parents don't live on a midnight-to-midnight clock. A 5 AM feed belongs to
-- the night that just happened, not to the fresh calendar day, and a family
-- whose baby wakes at 07:00 wants "today" to start there. Huckleberry lets a
-- parent set this; Grace Flare didn't, so every daily total, every History
-- day header, and every 7-day bar was pinned to local midnight.
--
-- Two nullable HH:MM columns on the existing public.children table (per child:
-- a newborn and a toddler in the same family keep different days):
--
--   * day_start_time   — when the tracked day begins. NULL = midnight, which
--                        is exactly today's behaviour, so existing families
--                        see no silent reshuffle of their history.
--   * night_start_time — when night sleep begins, for the nap-vs-night split.
--                        NULL = keep deriving it from the saved sleep plan's
--                        bedtime_earliest, then the age bracket (see
--                        src/lib/sleepTodo.ts resolveNightStartMin). A newborn
--                        has no fixed bedtime, so a hard default here would be
--                        worse than the age-aware fallback.
--
-- Both stored as HH:MM text, matching sleep_plans.wake_time / bedtime_earliest
-- and the value an <input type="time"> produces — not `time`, which would come
-- back as '07:00:00' and need trimming at every read site.
--
-- No RLS / purge changes needed: columns on public.children are already
-- covered by its policies and by the delete_user_account() /
-- _purge_user_data() cascade chain. list_accessible_children() RETURNS SETOF
-- public.children and picks the columns up automatically.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before ADD,
-- CREATE OR REPLACE FUNCTION. A re-run is a no-op.

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS day_start_time text,
  ADD COLUMN IF NOT EXISTS night_start_time text;

COMMENT ON COLUMN public.children.day_start_time IS
  'HH:MM local clock time the tracked day begins, e.g. ''07:00''. Daily totals '
  'and History day headers run from here to the same time the next day. '
  'NULL = midnight (the pre-2026-08-30 behaviour).';

COMMENT ON COLUMN public.children.night_start_time IS
  'HH:MM local clock time night sleep begins, used for the nap-vs-night split. '
  'NULL = derive from the saved sleep plan''s bedtime_earliest, then the age '
  'bracket default.';

-- Named CHECK constraints (DROP IF EXISTS first so re-runs and any future
-- widening migration can target them deterministically). 24-hour HH:MM only —
-- the same shape parseHHmm() in src/lib/sleepPlan.ts expects.
ALTER TABLE public.children
  DROP CONSTRAINT IF EXISTS children_day_start_time_valid;
ALTER TABLE public.children
  ADD CONSTRAINT children_day_start_time_valid CHECK (
    day_start_time IS NULL
    OR day_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

ALTER TABLE public.children
  DROP CONSTRAINT IF EXISTS children_night_start_time_valid;
ALTER TABLE public.children
  ADD CONSTRAINT children_night_start_time_valid CHECK (
    night_start_time IS NULL
    OR night_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

-- ---------------------------------------------------------------------------
-- get_child_profile(_child_id) — add the two schedule fields to the returned
-- jsonb so the MCP/AI read path describes a family's day the way the family
-- set it up. Definition carried forward from
-- 20260805000000_child_interests_temperament.sql; SECURITY INVOKER semantics
-- unchanged (RLS on public.children filters the row — callers without access
-- get NULL, not an error). Signature and return type are unchanged, so plain
-- CREATE OR REPLACE suffices (no DROP CASCADE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_child_profile(_child_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'gender', c.gender,
    'date_of_birth', c.date_of_birth,
    'age_in_days', (current_date - c.date_of_birth)::int,
    'is_premature', c.is_premature,
    'is_expected', c.is_expected,
    'birth_weight_oz', c.birth_weight_oz,
    'discharge_weight_oz', c.discharge_weight_oz,
    'next_appointment', c.next_appointment,
    'photo_url', c.photo_url,
    'interests', to_jsonb(c.interests),
    'temperament', c.temperament,
    'day_start_time', c.day_start_time,
    'night_start_time', c.night_start_time
  )
  FROM public.children c
  WHERE c.id = _child_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_child_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_child_profile(uuid) IS
  'Single-row child profile as jsonb. Includes a computed age_in_days, '
  'interests (text[] as jsonb array), temperament, and the family''s tracking '
  'schedule (day_start_time / night_start_time, both HH:MM or NULL). '
  'Returns NULL when the caller cannot see the child (RLS filters the row).';
