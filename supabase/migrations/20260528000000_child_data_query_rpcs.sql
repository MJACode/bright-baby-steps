-- Read-only RPC layer for Claude tool-use.
--
-- Stage 1 of the customer-facing-MCP plan: a small library of SECURITY INVOKER
-- functions that the in-app `chat` edge function (and, in Stage 2, the
-- external MCP server) can call as Anthropic tools.
--
-- These functions trust RLS. Every base table referenced (children,
-- sleep_logs, feeding_logs, diaper_logs, weight_logs, child_speech,
-- custom_milestones, milestone_flags, illness_logs, medication_logs,
-- vaccinations, allergen_introductions, allergen_exposure_logs,
-- allergen_reactions) has policies that allow the row when
-- `auth.uid() = parent_id` OR `public.has_partner_access(auth.uid(), parent_id)`.
-- SECURITY INVOKER means `auth.uid()` here is the caller and RLS filters
-- automatically. Callers without access see an empty result set, not an
-- error — that's by design and how RLS leaks shouldn't happen.
--
-- All functions are STABLE (no writes), set search_path to public/pg_temp,
-- and GRANTed to authenticated only (not anon).
--
-- Idempotent: DROP IF EXISTS before each CREATE so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. list_accessible_children()
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_accessible_children() CASCADE;

CREATE OR REPLACE FUNCTION public.list_accessible_children()
RETURNS SETOF public.children
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.children
  WHERE archived_at IS NULL
  ORDER BY created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_accessible_children() TO authenticated;

COMMENT ON FUNCTION public.list_accessible_children() IS
  'Returns every non-archived child the caller can see (owned + partner-access). '
  'RLS on public.children does the filtering; no auth checks in the function body.';

-- ---------------------------------------------------------------------------
-- 2. get_child_profile(_child_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_child_profile(uuid) CASCADE;

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
    'photo_url', c.photo_url
  )
  FROM public.children c
  WHERE c.id = _child_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_child_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_child_profile(uuid) IS
  'Single-row child profile as jsonb. Includes a computed age_in_days. '
  'Returns NULL when the caller cannot see the child (RLS filters the row).';

-- ---------------------------------------------------------------------------
-- 3. get_recent_sleep(_child_id, _hours)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_recent_sleep(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_recent_sleep(
  _child_id uuid,
  _hours int DEFAULT 48
)
RETURNS SETOF public.sleep_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.sleep_logs
  WHERE child_id = _child_id
    AND started_at >= now() - make_interval(hours => GREATEST(_hours, 1))
  ORDER BY started_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_sleep(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_recent_sleep(uuid, int) IS
  'Sleep log rows for a child in the last N hours (default 48), newest first.';

-- ---------------------------------------------------------------------------
-- 4. get_recent_feeds(_child_id, _hours)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_recent_feeds(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_recent_feeds(
  _child_id uuid,
  _hours int DEFAULT 48
)
RETURNS SETOF public.feeding_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.feeding_logs
  WHERE child_id = _child_id
    AND logged_at >= now() - make_interval(hours => GREATEST(_hours, 1))
  ORDER BY logged_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_feeds(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_recent_feeds(uuid, int) IS
  'Feeding log rows for a child in the last N hours (default 48), newest first.';

-- ---------------------------------------------------------------------------
-- 5. get_recent_diapers(_child_id, _hours)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_recent_diapers(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_recent_diapers(
  _child_id uuid,
  _hours int DEFAULT 48
)
RETURNS SETOF public.diaper_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.diaper_logs
  WHERE child_id = _child_id
    AND logged_at >= now() - make_interval(hours => GREATEST(_hours, 1))
  ORDER BY logged_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_diapers(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_recent_diapers(uuid, int) IS
  'Diaper log rows for a child in the last N hours (default 48), newest first.';

-- ---------------------------------------------------------------------------
-- 6. get_growth(_child_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_growth(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_growth(_child_id uuid)
RETURNS SETOF public.weight_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.weight_logs
  WHERE child_id = _child_id
  ORDER BY logged_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_growth(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_growth(uuid) IS
  'All growth measurements (weight, length, head circumference) for a child, '
  'oldest first. RLS on weight_logs (via child_id -> children.parent_id) filters.';

-- ---------------------------------------------------------------------------
-- 7. get_milestones(_child_id, _status)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_milestones(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.get_milestones(
  _child_id uuid,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  _achieved jsonb;
  _custom jsonb;
  _flagged jsonb;
  _result jsonb;
BEGIN
  -- Achieved canonical speech milestones (child_speech with status='achieved').
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO _achieved
  FROM (
    SELECT
      cs.id,
      cs.milestone_id,
      s.name AS milestone_name,
      cs.achieved_at,
      cs.notes,
      cs.photo_url,
      cs.status
    FROM public.child_speech cs
    LEFT JOIN public.speech s ON s.id = cs.milestone_id
    WHERE cs.child_id = _child_id
      AND cs.status = 'achieved'
    ORDER BY cs.achieved_at DESC NULLS LAST
  ) row;

  -- Custom (parent-created) milestones — always considered achieved.
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO _custom
  FROM (
    SELECT
      cm.id,
      cm.name,
      cm.category,
      cm.achieved_at,
      cm.caption,
      cm.notes,
      cm.photo_url,
      cm.source
    FROM public.custom_milestones cm
    WHERE cm.child_id = _child_id
    ORDER BY cm.achieved_at DESC
  ) row;

  -- Active milestone flags (not dismissed).
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO _flagged
  FROM (
    SELECT
      mf.id,
      mf.milestone_id,
      s.name AS milestone_name,
      mf.severity,
      mf.first_flagged_at,
      mf.last_evaluated_at,
      mf.dismissed_at,
      mf.dismissed_reason
    FROM public.milestone_flags mf
    LEFT JOIN public.speech s ON s.id = mf.milestone_id
    WHERE mf.child_id = _child_id
      AND mf.dismissed_at IS NULL
    ORDER BY mf.first_flagged_at DESC
  ) row;

  IF _status = 'achieved' THEN
    _result := jsonb_build_object('achieved', _achieved, 'custom', _custom);
  ELSIF _status = 'flagged' THEN
    _result := jsonb_build_object('flagged', _flagged);
  ELSE
    _result := jsonb_build_object(
      'achieved', _achieved,
      'custom', _custom,
      'flagged', _flagged
    );
  END IF;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_milestones(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_milestones(uuid, text) IS
  'Merged milestone view: canonical achieved (child_speech), custom (parent-created), '
  'and active flags (milestone_flags where dismissed_at IS NULL). _status filters: '
  '''achieved'' returns achieved+custom, ''flagged'' returns flags only, NULL returns all.';

-- ---------------------------------------------------------------------------
-- 8. get_illnesses(_child_id, _active_only)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_illnesses(uuid, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.get_illnesses(
  _child_id uuid,
  _active_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY start_date DESC), '[]'::jsonb)
  FROM (
    SELECT
      il.id,
      il.illness_name,
      il.start_date,
      il.end_date,
      il.notes,
      il.created_at,
      il.updated_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ml.id,
          'medication_name', ml.medication_name,
          'dose', ml.dose,
          'frequency', ml.frequency,
          'start_date', ml.start_date,
          'end_date', ml.end_date,
          'notes', ml.notes
        ) ORDER BY ml.start_date DESC)
        FROM public.medication_logs ml
        WHERE ml.illness_log_id = il.id
      ), '[]'::jsonb) AS medications
    FROM public.illness_logs il
    WHERE il.child_id = _child_id
      AND (NOT _active_only OR il.end_date IS NULL)
  ) row;
$$;

GRANT EXECUTE ON FUNCTION public.get_illnesses(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_illnesses(uuid, boolean) IS
  'Illness log entries with their medications joined as a nested array. '
  '_active_only=true filters to rows with end_date IS NULL. Newest illness first.';

-- ---------------------------------------------------------------------------
-- 9. get_vaccinations(_child_id, _upcoming_only)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_vaccinations(uuid, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.get_vaccinations(
  _child_id uuid,
  _upcoming_only boolean DEFAULT false
)
RETURNS SETOF public.vaccinations
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.vaccinations
  WHERE child_id = _child_id
    AND (
      NOT _upcoming_only
      OR (next_due_date IS NOT NULL AND next_due_date >= current_date)
    )
  ORDER BY COALESCE(next_due_date, date_administered) ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_vaccinations(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_vaccinations(uuid, boolean) IS
  'Vaccinations for a child. _upcoming_only=true → rows with next_due_date >= today. '
  'ORDER BY next_due_date (fallback date_administered) ascending.';

-- ---------------------------------------------------------------------------
-- 10. get_allergens(_child_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_allergens(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.get_allergens(_child_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      ai.id,
      ai.allergen_id,
      a.name AS allergen_name,
      a.category AS allergen_category,
      a.slug AS allergen_slug,
      ai.status,
      ai.is_high_risk,
      ai.high_risk_reason,
      ai.pediatrician_cleared,
      ai.scheduled_introduction_date,
      ai.first_introduced_at,
      ai.completed_at,
      ai.notes,
      ai.created_at,
      ai.updated_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', el.id,
          'exposure_number', el.exposure_number,
          'logged_at', el.logged_at,
          'food_form', el.food_form,
          'amount_description', el.amount_description,
          'observation_window_ends_at', el.observation_window_ends_at,
          'reaction_observed', el.reaction_observed,
          'notes', el.notes
        ) ORDER BY el.logged_at ASC)
        FROM public.allergen_exposure_logs el
        WHERE el.allergen_introduction_id = ai.id
      ), '[]'::jsonb) AS exposures,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ar.id,
          'exposure_log_id', ar.exposure_log_id,
          'observed_at', ar.observed_at,
          'severity', ar.severity,
          'symptoms', ar.symptoms,
          'parent_description', ar.parent_description,
          'treatment_given', ar.treatment_given,
          'epinephrine_used', ar.epinephrine_used,
          'medical_attention_sought', ar.medical_attention_sought,
          'emergency_services_called', ar.emergency_services_called,
          'resolved_at', ar.resolved_at
        ) ORDER BY ar.observed_at DESC)
        FROM public.allergen_reactions ar
        WHERE ar.exposure_log_id IN (
          SELECT el2.id
          FROM public.allergen_exposure_logs el2
          WHERE el2.allergen_introduction_id = ai.id
        )
      ), '[]'::jsonb) AS reactions
    FROM public.allergen_introductions ai
    LEFT JOIN public.allergens a ON a.id = ai.allergen_id
    WHERE ai.child_id = _child_id
  ) row;
$$;

GRANT EXECUTE ON FUNCTION public.get_allergens(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_allergens(uuid) IS
  'Allergen introductions for a child with nested exposures and reactions arrays. '
  'Includes full status (not_started/in_progress/completed/etc.), high-risk flags, '
  'and any logged reactions.';

-- ---------------------------------------------------------------------------
-- 11. get_summary(_child_id, _days)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_summary(uuid, int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_summary(
  _child_id uuid,
  _days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  _window int := GREATEST(_days, 1);
  _since timestamptz := now() - make_interval(days => _window);
  _sleep jsonb;
  _feeds jsonb;
  _diapers jsonb;
  _milestones_achieved_count int;
  _milestone_flags_count int;
BEGIN
  -- Sleep aggregates over the window.
  SELECT jsonb_build_object(
    'total_minutes', COALESCE(SUM(duration_minutes), 0)::int,
    'longest_stretch_minutes', COALESCE(MAX(duration_minutes), 0)::int,
    'count', COUNT(*)::int
  )
  INTO _sleep
  FROM public.sleep_logs
  WHERE child_id = _child_id
    AND started_at >= _since
    AND duration_minutes IS NOT NULL;

  -- Feed aggregates. count_by_type uses the actual feeding_type enum values:
  -- 'breast' (direct nursing), 'bottle_breast_milk', 'bottle_formula', 'pump'
  -- (pumping session, no infant intake), 'solid'. Total `count` includes pump
  -- rows — consumers can subtract count_by_type.pump to get feed-to-baby count.
  SELECT jsonb_build_object(
    'count', COUNT(*)::int,
    'total_oz', COALESCE(SUM(amount_oz), 0)::numeric,
    'count_by_type', jsonb_build_object(
      'breast',             COUNT(*) FILTER (WHERE feeding_type = 'breast')::int,
      'bottle_breast_milk', COUNT(*) FILTER (WHERE feeding_type = 'bottle_breast_milk')::int,
      'bottle_formula',     COUNT(*) FILTER (WHERE feeding_type = 'bottle_formula')::int,
      'pump',               COUNT(*) FILTER (WHERE feeding_type = 'pump')::int,
      'solid',              COUNT(*) FILTER (WHERE feeding_type = 'solid')::int
    )
  )
  INTO _feeds
  FROM public.feeding_logs
  WHERE child_id = _child_id
    AND logged_at >= _since;

  -- Diaper aggregates. The diaper_type enum is wet/dirty/both — 'both' means a
  -- diaper with both pee and poop (some apps call this 'mixed'; this codebase
  -- stores it as 'both').
  SELECT jsonb_build_object(
    'count', COUNT(*)::int,
    'count_by_type', jsonb_build_object(
      'wet',   COUNT(*) FILTER (WHERE diaper_type = 'wet')::int,
      'dirty', COUNT(*) FILTER (WHERE diaper_type = 'dirty')::int,
      'both',  COUNT(*) FILTER (WHERE diaper_type = 'both')::int
    )
  )
  INTO _diapers
  FROM public.diaper_logs
  WHERE child_id = _child_id
    AND logged_at >= _since;

  -- Milestones achieved in the window (canonical + custom).
  SELECT (
    (SELECT COUNT(*)
       FROM public.child_speech
       WHERE child_id = _child_id
         AND status = 'achieved'
         AND achieved_at >= _since)
    +
    (SELECT COUNT(*)
       FROM public.custom_milestones
       WHERE child_id = _child_id
         AND achieved_at >= _since)
  )::int
  INTO _milestones_achieved_count;

  -- Active (not dismissed) milestone flags first-flagged in the window.
  SELECT COUNT(*)::int
  INTO _milestone_flags_count
  FROM public.milestone_flags
  WHERE child_id = _child_id
    AND dismissed_at IS NULL
    AND first_flagged_at >= _since;

  RETURN jsonb_build_object(
    'window_days', _window,
    'sleep', _sleep,
    'feeds', _feeds,
    'diapers', _diapers,
    'milestones_achieved_count', _milestones_achieved_count,
    'milestone_flags_count', _milestone_flags_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_summary(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_summary(uuid, int) IS
  'Rollup over the last N days (default 7): total sleep minutes, longest sleep stretch, '
  'feed counts by type and total_oz, diaper counts by type, milestones achieved, '
  'and active milestone flags first-raised in the window.';
