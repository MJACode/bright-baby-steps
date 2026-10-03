-- Baby Signs v2 (PR-B): bind child_signs writes to the child's real owner.
--
-- The hole (from v1, 20260828000000_child_signs.sql):
--   INSERT/UPDATE WITH CHECK (auth.uid() = parent_id OR partner_can_write(parent_id))
-- checks the client-supplied parent_id but never ties it to child_id. Any
-- signed-in user who knew a child UUID could insert rows for that child
-- stamped with their OWN uid as parent_id (the `auth.uid() = parent_id`
-- disjunct satisfies itself — the 2026-07-29 lesson). The real family could
-- neither see nor delete those rows (SELECT/DELETE are keyed on the row's
-- parent_id). Once 20260930000000_child_signs_focus.sql added a
-- SECURITY DEFINER count of focus rows per child_id, it was a cross-tenant
-- DoS: three forged focus rows leave the family stuck on
-- focus_limit_reached for good.
--
-- The fix keeps the owner-keyed model (parent_id = the child's owner) and the
-- Flare+ partner gate, and adds a binding check on both write paths:
--   WITH CHECK (
--     public.partner_can_write(parent_id)
--     AND EXISTS (SELECT 1 FROM public.children c
--                 WHERE c.id = child_signs.child_id
--                   AND c.parent_id = child_signs.parent_id)
--   )
-- `partner_can_write(_owner_id)` already returns true when
-- auth.uid() = _owner_id (live definition: `auth.uid() = _owner_id OR
-- (owner_has_plus(_owner_id) AND active coparent/caregiver partner_access)`),
-- so the v1 `auth.uid() = parent_id OR` prefix is redundant and is dropped.
-- The EXISTS runs under the writer's RLS on children
-- (select_own_or_partner_children: owner OR has_partner_access). That passes
-- for the owner, and for any write-capable partner, because partner_can_write
-- needs owner_has_plus plus an active partner_access row, which is a superset
-- of has_partner_access. A stranger fails both halves: with parent_id = self
-- the child's owner is not self, and with parent_id = the real owner
-- partner_can_write is false.
--
-- UPDATE USING, DELETE USING and SELECT stay as they are. With the binding
-- in place every row's parent_id is its child's owner, so those parent_id
-- checks are equivalent to child-owner checks. UPDATE WITH CHECK also blocks
-- moving a row to another family's child (child_id and parent_id must still
-- match an owned or partner-writable child). child_signs had 0 rows live when
-- this was applied, so there are no forged rows to clean up.
--
-- Trigger: child_signs_focus_limit now also fires on UPDATE OF child_id, so
-- a child_id-only update can't move a focused row onto a child that already
-- has 3 focus signs without being re-checked. The function stays
-- SECURITY DEFINER: forged rows can no longer exist, so the cross-caregiver
-- count is both correct and harmless.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY, DROP TRIGGER IF EXISTS
-- + CREATE TRIGGER.

DROP POLICY IF EXISTS child_signs_insert ON public.child_signs;
CREATE POLICY child_signs_insert
  ON public.child_signs
  FOR INSERT
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = child_signs.child_id
         AND c.parent_id = child_signs.parent_id
    )
  );

DROP POLICY IF EXISTS child_signs_update ON public.child_signs;
CREATE POLICY child_signs_update
  ON public.child_signs
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (
    public.partner_can_write(parent_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
       WHERE c.id = child_signs.child_id
         AND c.parent_id = child_signs.parent_id
    )
  );

DROP TRIGGER IF EXISTS child_signs_focus_limit ON public.child_signs;
CREATE TRIGGER child_signs_focus_limit
  BEFORE INSERT OR UPDATE OF focus_since, child_id ON public.child_signs
  FOR EACH ROW
  EXECUTE FUNCTION public.child_signs_focus_limit();
