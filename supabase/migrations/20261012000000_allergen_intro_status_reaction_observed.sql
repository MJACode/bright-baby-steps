-- =============================================================================
-- allergen_introductions.status: allow 'reaction_observed'
-- =============================================================================
-- Why
--   Live carries an un-versioned CHECK constraint (created outside the repo's
--   migrations, likely via the dashboard / an early Lovable edit):
--     allergen_introductions_status_check
--       CHECK (status = ANY (ARRAY['not_started','in_progress','completed',
--                                  'paused','skipped']))
--   The client (src/components/feeding/AllergenTracker.tsx, via
--   introStateAfterExposureRemoval, and the reaction-logging path) writes
--   status = 'reaction_observed'. Every such write fails with 23514, so a
--   reaction never reaches the intro row and is missing from the pediatrician
--   PDF, the MCP get_allergens RPC, and the data export.
--
-- What
--   Drop and re-add the same constraint name with the existing five values
--   plus 'reaction_observed'. Name kept as-is (not _v2) so the repo now owns the
--   definition under the name live already uses.
--
-- Safety
--   Verified read-only on live 2026-10-12: the only existing status value is
--   'in_progress' (1 row), so re-adding (validated) cannot fail.
--   get_allergens(uuid) passes ai.status through untouched (no CASE mapping),
--   so it needs no change. No triggers on the table other than set_updated_at.
--
-- Idempotent: DROP ... IF EXISTS + ADD; a re-run is a no-op in effect.
-- =============================================================================

ALTER TABLE public.allergen_introductions
  DROP CONSTRAINT IF EXISTS allergen_introductions_status_check;

ALTER TABLE public.allergen_introductions
  ADD CONSTRAINT allergen_introductions_status_check
  CHECK (status = ANY (ARRAY[
    'not_started'::text,
    'in_progress'::text,
    'completed'::text,
    'paused'::text,
    'skipped'::text,
    'reaction_observed'::text
  ]));
