-- Child Context v1 — interests + temperament on public.children.
--
-- Two new parent-curated profile fields the AI surfaces (chat, briefing,
-- next-step-peek, extract-memory) read via the shared childContext loader:
--   * interests    — text[] drawn from a FIXED allowlist, max 6 selections.
--   * temperament  — single optional value from a fixed set.
--
-- The fixed allowlist is deliberate COPPA data-minimization: we collect a
-- bounded, non-free-text set of activity interests rather than arbitrary
-- prose about a child. Adding a new interest later = a NEW migration that
-- re-creates `children_interests_valid` with the widened array (see
-- lessons-backend 2026-05-19 on named CHECK constraints). Do NOT widen the
-- column to free text.
--
-- No RLS / purge changes needed: these are columns on the existing
-- public.children table, already covered by its policies and by the
-- delete_user_account() / _purge_user_data() cascade chain.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before
-- ADD, CREATE OR REPLACE FUNCTION. A re-run is a no-op.

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS temperament text;

COMMENT ON COLUMN public.children.interests IS
  'Parent-selected activity interests. Fixed allowlist (COPPA data minimization '
  '— no free text), max 6. Enforced by children_interests_valid.';

COMMENT ON COLUMN public.children.temperament IS
  'Optional parent-selected temperament: easygoing | sensitive | spirited | '
  'slow_to_warm. Enforced by children_temperament_valid.';

-- Named CHECK constraints (DROP IF EXISTS first so re-runs and future
-- widening migrations can target them deterministically).
-- Note: duplicate elements (e.g. '{music,music}') are tolerated at the DB
-- level — CHECK constraints can't use subqueries, and a dedup helper function
-- isn't worth it. Writers (Phase 2 UI) must write deduplicated arrays.
ALTER TABLE public.children
  DROP CONSTRAINT IF EXISTS children_interests_valid;
ALTER TABLE public.children
  ADD CONSTRAINT children_interests_valid CHECK (
    interests <@ ARRAY[
      'music','books','movement','water_play','animals',
      'vehicles','outdoors','food_exploring','building','pretend_play'
    ]::text[]
    AND cardinality(interests) <= 6
  );

ALTER TABLE public.children
  DROP CONSTRAINT IF EXISTS children_temperament_valid;
ALTER TABLE public.children
  ADD CONSTRAINT children_temperament_valid CHECK (
    temperament IS NULL
    OR temperament IN ('easygoing','sensitive','spirited','slow_to_warm')
  );

-- ---------------------------------------------------------------------------
-- get_child_profile(_child_id) — add interests + temperament to the returned
-- jsonb. Definition copied from 20260528000000_child_data_query_rpcs.sql;
-- SECURITY INVOKER semantics unchanged (RLS on public.children filters the
-- row — callers without access get NULL, not an error). Signature and return
-- type are unchanged, so plain CREATE OR REPLACE suffices (no DROP CASCADE).
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
    'temperament', c.temperament
  )
  FROM public.children c
  WHERE c.id = _child_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_child_profile(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_child_profile(uuid) IS
  'Single-row child profile as jsonb. Includes a computed age_in_days plus '
  'interests (text[] as jsonb array) and temperament. '
  'Returns NULL when the caller cannot see the child (RLS filters the row).';

-- Note: list_accessible_children() RETURNS SETOF public.children and picks up
-- the new columns automatically — no redefinition needed.
