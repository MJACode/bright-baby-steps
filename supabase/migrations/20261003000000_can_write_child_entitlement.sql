-- can_write_child: re-assert the seat-entitlement rule from 20260930100000.
--
-- 20261001000000_can_write_child_requires_owner_plus.sql (written by a parallel
-- session against the Aug "Flare+ only" design) sorts AFTER 20260930100000 and
-- replaces can_write_child with an owner_has_plus(c.parent_id) gate. Under the
-- founder-approved 2026-09-30 decision (free 1 / Flare+ 2, longest-standing
-- partner keeps access on lapse), that would let a free owner's one partner read
-- but not write. Its goal — reads and writes suspend together — is already met by
-- partner_within_entitlement(), which both can_access_child and can_write_child
-- call.
--
-- On live this is a no-op: free_partner_seat_1_functions (applied 2026-10-02
-- 22:40 UTC) already restored this exact body after the parallel session applied
-- can_write_child_requires_owner_plus (2026-10-02 01:05 UTC). This file only makes
-- a fresh `supabase db push` converge on the same definition as live.
--
-- CREATE OR REPLACE keeps existing grants (rls_helper tier: anon + authenticated,
-- see 20260930100000 section 7).

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
  'Guarded by _user_id = auth.uid().';
