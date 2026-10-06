-- Deleting a child now removes every row about that child, whoever logged it.
--
-- Audit 2026-10-06 (live schema): 45 tables reference public.children. 43
-- already cascade, so a co-parent's or caregiver's entries go with the child.
-- Three gaps:
--
--   parent_financial_checklist.child_id  FK with NO ACTION — a child with a
--     per-child checklist row could not be deleted at all (FK violation).
--   pediatrician_exports.child_id        FK with NO ACTION — same failure once
--     any PDF export had been recorded for the child.
--   custom_milestones.child_id           no FK at all — rows would survive
--     the child's deletion as orphans.
--
-- Live counts at audit time: parent_financial_checklist 5 rows (all with
-- child_id NULL, i.e. parent-level items, unaffected), pediatrician_exports 0,
-- custom_milestones 0 (0 orphans). So no data changes; this only fixes the
-- behaviour going forward. Account-level deletion was already covered —
-- _purge_user_data deletes these tables by parent_id.

ALTER TABLE public.parent_financial_checklist
  DROP CONSTRAINT IF EXISTS parent_financial_checklist_child_id_fkey,
  ADD CONSTRAINT parent_financial_checklist_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;

ALTER TABLE public.pediatrician_exports
  DROP CONSTRAINT IF EXISTS pediatrician_exports_child_id_fkey,
  ADD CONSTRAINT pediatrician_exports_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;

-- Clear any orphans first so the new FK can validate (0 at audit time).
DELETE FROM public.custom_milestones cm
WHERE NOT EXISTS (SELECT 1 FROM public.children c WHERE c.id = cm.child_id);

ALTER TABLE public.custom_milestones
  DROP CONSTRAINT IF EXISTS custom_milestones_child_id_fkey,
  ADD CONSTRAINT custom_milestones_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;
