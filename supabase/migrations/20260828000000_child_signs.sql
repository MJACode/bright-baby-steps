-- Per-child sign-language progress tracking for the Baby Signs program.
--
-- `sign_slug` references client-side static content
-- (`src/data/signLibrary.ts`) — it is a bounded, non-free-text slug, in
-- the same COPPA data-minimization spirit as
-- `20260819000100_child_activities.sql`: we record WHICH curated sign a
-- child is learning, never arbitrary prose about the child. Do NOT widen
-- this to free text.
--
-- One row per (child, sign): rows are written via upsert on
-- (child_id, sign_slug), so UNIQUE (child_id, sign_slug) is both the
-- upsert conflict target and the DB-level guarantee. Unlike
-- child_activities, UPDATE genuinely IS part of the flow here — `status`
-- moves in BOTH directions ('introduced' ⇄ 'emerging' ⇄ 'signing') via
-- the upsert, so the UPDATE policy is load-bearing, not just pattern
-- parity. `first_signed_at` is nullable and stamped by the client when
-- status first reaches 'signing'.
--
-- Deletion path (same double-cascade as child_activities):
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both run during `delete_user_account()` (children are deleted by parent_id,
-- and the final DELETE FROM auth.users cascades anyway), so this table does NOT
-- need its own line in that RPC.

CREATE TABLE IF NOT EXISTS public.child_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sign_slug text NOT NULL,
  status text NOT NULL CHECK (status IN ('introduced', 'emerging', 'signing')),
  first_signed_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_signs_once UNIQUE (child_id, sign_slug)
);

-- child_id index for "all signs for this child" scans. The UNIQUE
-- constraint above also covers child_id-leading lookups, but the explicit
-- index is requested for clarity and survives constraint refactors.
CREATE INDEX IF NOT EXISTS idx_child_signs_child
  ON public.child_signs (child_id);

ALTER TABLE public.child_signs ENABLE ROW LEVEL SECURITY;

-- RLS mirrors child_activities / speech_practice_plans:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write (load-bearing: status upserts move both ways)
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS child_signs_select ON public.child_signs;
CREATE POLICY child_signs_select
  ON public.child_signs
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS child_signs_insert ON public.child_signs;
CREATE POLICY child_signs_insert
  ON public.child_signs
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_signs_update ON public.child_signs;
CREATE POLICY child_signs_update
  ON public.child_signs
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS child_signs_delete ON public.child_signs;
CREATE POLICY child_signs_delete
  ON public.child_signs
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.child_signs IS
  'Per-child sign-language progress for the Baby Signs program. sign_slug '
  'is a bounded slug referencing client-side static content '
  '(src/data/signLibrary.ts) — no free text (COPPA data minimization). '
  'One row per (child_id, sign_slug); written via upsert, status moves both '
  'directions. Cascade-deleted with children or auth.users.';
