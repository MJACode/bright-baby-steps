-- Retroactive milestone catch-up for parents who sign up with an older child.
-- NULL within the first 14 days of children.created_at suppresses MilestoneFlags
-- red-flag alerts so a parent who just joined isn't blasted with backdated concerns
-- for milestones they never had a chance to log. Stamped to NOW() when the parent
-- finishes (or explicitly skips) the catch-up step.

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS retroactive_setup_completed_at timestamptz NULL;

COMMENT ON COLUMN public.children.retroactive_setup_completed_at IS
  'Set when the parent finishes or skips the onboarding milestone catch-up. '
  'NULL within 14 days of children.created_at suppresses MilestoneFlags red-flag alerts.';

-- Grandfather existing rows so pre-feature accounts don't suddenly see the
-- "Finish setting up X" banner or have their existing flags suppressed for 14
-- days. Only brand-new children (created after this migration ships) opt into
-- the gate. Idempotent: only stamps rows where the column is still NULL.
UPDATE public.children
   SET retroactive_setup_completed_at = COALESCE(created_at, now())
 WHERE retroactive_setup_completed_at IS NULL;
