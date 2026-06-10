-- Per-child developmental-leap notes — one row per child per leap (1–10).
--
-- The leaps feature lets parents record a note (and a status) against each of
-- the ten developmental "leaps" rendered from the static LEAPS array in
-- src/lib/leaps.ts. leap_number is the join key into that static array; this
-- table persists the parent's per-leap status + free-text note so it survives
-- reloads and syncs across the primary parent and any partners.
--
-- Mirrors `20260606010000_sleep_day_todos.sql` exactly for RLS helpers, the
-- update_updated_at trigger wiring, and column conventions. Differences:
--   - keyed one row per (child_id, leap_number) instead of one per (child, date)
--   - `leap_number` is an int 1..10 joining the static LEAPS array
--   - `status` is a small enum-via-CHECK ('noted','in_progress','completed')
--   - `notes` is the parent's free-text note for that leap
--
-- Deletion path (same reasoning as sleep_day_todos / speech_practice_plans):
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both run during `delete_user_account()` (children are deleted by parent_id,
-- and the final DELETE FROM auth.users cascades anyway), so this table does NOT
-- need its own line in that RPC.

CREATE TABLE IF NOT EXISTS public.child_leaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  leap_number int NOT NULL CHECK (leap_number BETWEEN 1 AND 10),  -- joins to the static LEAPS array in src/lib/leaps.ts
  status text NOT NULL DEFAULT 'noted' CHECK (status IN ('noted','in_progress','completed')),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT child_leaps_one_per_child_leap UNIQUE (child_id, leap_number)
);

-- parent_id index for "all leaps owned by this user" scans. The (child_id,
-- leap_number) lookup is already served by the UNIQUE constraint above, so no
-- redundant helper index is added.
CREATE INDEX IF NOT EXISTS idx_child_leaps_parent
  ON public.child_leaps (parent_id);

-- Reuse the existing public.update_updated_at() helper (defined in
-- 20260322213259_*.sql). Don't redefine it.
DROP TRIGGER IF EXISTS update_child_leaps_updated_at ON public.child_leaps;
CREATE TRIGGER update_child_leaps_updated_at
  BEFORE UPDATE ON public.child_leaps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.child_leaps ENABLE ROW LEVEL SECURITY;

-- RLS mirrors sleep_day_todos:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS child_leaps_select ON public.child_leaps;
CREATE POLICY child_leaps_select
  ON public.child_leaps
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS child_leaps_insert ON public.child_leaps;
CREATE POLICY child_leaps_insert
  ON public.child_leaps
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_leaps_update ON public.child_leaps;
CREATE POLICY child_leaps_update
  ON public.child_leaps
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_leaps_delete ON public.child_leaps;
CREATE POLICY child_leaps_delete
  ON public.child_leaps
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.child_leaps IS
  'Per-child developmental-leap notes. One row per child per leap '
  '(UNIQUE child_id, leap_number; leap_number 1..10 joins the static LEAPS '
  'array in src/lib/leaps.ts). status is one of noted/in_progress/completed; '
  'notes is the parent free-text note. Cascade-deleted with children or '
  'auth.users.';
