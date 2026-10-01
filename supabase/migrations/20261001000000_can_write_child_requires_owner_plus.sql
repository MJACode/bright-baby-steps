-- can_write_child: partner write access now also requires the owner's Flare+.
--
-- Why: 20260828100000_partner_seats_flare_plus added `owner_has_plus(c.parent_id)`
-- to the read helper `can_access_child` but not to `can_write_child`. A coparent or
-- caregiver of an owner whose Flare+ lapsed therefore lost read access but could
-- still insert, update and delete that child's logs through the 54 RLS policies that
-- call can_write_child. Listed as outstanding in docs/legal-review-log.md
-- (2026-10-01, "Production catch-up: partner seats require Flare+").
--
-- What changes: the partner branch gains `AND public.owner_has_plus(c.parent_id)`,
-- mirroring can_access_child exactly. The owner branch is unchanged, so a primary
-- parent always keeps write access to their own children regardless of Flare+.
-- Signature, SECURITY DEFINER, STABLE, search_path and the auth.uid() guard are
-- identical to the live definition (fetched 2026-10-01). CREATE OR REPLACE keeps the
-- existing EXECUTE grants unchanged.
--
-- Who is affected: active coparent/caregiver partners whose owner lacks Flare+.
-- Count on live at 2026-10-01: 0.

CREATE OR REPLACE FUNCTION public.can_write_child(_user_id uuid, _child_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        AND public.owner_has_plus(c.parent_id)
    )
  )
$function$;
