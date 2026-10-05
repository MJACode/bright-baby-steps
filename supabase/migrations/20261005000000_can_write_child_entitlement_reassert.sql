-- Re-assert the entitlement-based can_write_child from 20260930100000_free_partner_seat.sql.
--
-- Why: 20261001000000_can_write_child_requires_owner_plus.sql gated partner writes
-- on owner_has_plus() alone. On live it ran BEFORE 20260930100000 was applied, so
-- live is correct (free_partner_seat's entitlement version won). But by filename
-- order the 20261001 file sorts AFTER 20260930100000, so any replay of the repo
-- migrations (fresh environment, branch database, `db reset`) would end with the
-- Flare+-only version and lock a free account's one entitled partner out of
-- writes. This file restores the founder-approved model (free = 1 seat, Flare+ = 2,
-- the longest-standing partner keeps access on lapse) at the end of the chain.
--
-- On live this is a no-op: the body below is identical to the current definition
-- (verified 2026-10-05). CREATE OR REPLACE keeps existing grants.

CREATE OR REPLACE FUNCTION public.can_write_child(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE id = _child_id AND parent_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.partner_access pa ON pa.owner_id = c.parent_id
      WHERE c.id = _child_id
        AND pa.partner_id = _user_id
        AND pa.status = 'active'
        AND pa.role IN ('coparent', 'caregiver')
        AND public.partner_within_entitlement(c.parent_id, _user_id)
    )
  )
$$;

COMMENT ON FUNCTION public.can_write_child(uuid, uuid) IS
  'True when _user_id owns _child_id, or holds an active write-capable '
  'partner_access row (coparent | caregiver, never viewer) to that child''s '
  'owner that is within the owner''s seat entitlement '
  '(partner_within_entitlement). Write-side counterpart to can_access_child(). '
  'Role set mirrors partner_can_write(); keep the two in sync. Guarded by '
  '_user_id = auth.uid() so it cannot be used to probe another user''s access.';
