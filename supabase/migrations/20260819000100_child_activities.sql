-- Per-child "Tried it" tracking for the curated activity library.
--
-- `activity_slug` references client-side static content
-- (`src/data/activityLibrary.ts`) — it is a bounded, non-free-text slug, in
-- the same COPPA data-minimization spirit as
-- `20260805000000_child_interests_temperament.sql`: we record WHICH curated
-- activity a child tried, never arbitrary prose about the child. Do NOT widen
-- this to free text.
--
-- One row per (child, activity): the "Tried it" toggle is an INSERT on check
-- and a DELETE on uncheck, so UNIQUE (child_id, activity_slug) enforces the
-- toggle semantics at the DB level. UPDATE is not part of the flow, but the
-- policy is included anyway to mirror the speech_practice_plans RLS block
-- exactly.
--
-- Deletion path (same reasoning as speech_practice_plans / activity_plans):
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both run during `delete_user_account()` (children are deleted by parent_id,
-- and the final DELETE FROM auth.users cascades anyway), so this table does NOT
-- need its own line in that RPC.

CREATE TABLE IF NOT EXISTS public.child_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_slug text NOT NULL,
  tried_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_activities_once UNIQUE (child_id, activity_slug)
);

-- child_id index for "all tried activities for this child" scans. The UNIQUE
-- constraint above also covers child_id-leading lookups, but the explicit
-- index is requested for clarity and survives constraint refactors.
CREATE INDEX IF NOT EXISTS idx_child_activities_child
  ON public.child_activities (child_id);

ALTER TABLE public.child_activities ENABLE ROW LEVEL SECURITY;

-- RLS mirrors speech_practice_plans:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write (unused by the toggle flow; kept for pattern parity)
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS child_activities_select ON public.child_activities;
CREATE POLICY child_activities_select
  ON public.child_activities
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS child_activities_insert ON public.child_activities;
CREATE POLICY child_activities_insert
  ON public.child_activities
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_activities_update ON public.child_activities;
CREATE POLICY child_activities_update
  ON public.child_activities
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_activities_delete ON public.child_activities;
CREATE POLICY child_activities_delete
  ON public.child_activities
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.child_activities IS
  'Per-child "Tried it" marks for the curated activity library. activity_slug '
  'is a bounded slug referencing client-side static content '
  '(src/data/activityLibrary.ts) — no free text (COPPA data minimization). '
  'One row per (child_id, activity_slug); toggle = insert/delete. '
  'Cascade-deleted with children or auth.users.';
