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
