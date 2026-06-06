-- Make sleep_day_todos rows owner-keyed so the single shared row per child/day
-- is visible to BOTH the owner and every linked partner.
--
-- sleep_day_todos has one row per (child_id, plan_date). RLS SELECT is
-- has_partner_access(auth.uid(), parent_id), which is directional: a partner
-- can read a row only when a partner_access link exists with
-- (partner_id = viewer, owner_id = parent_id). If the row were stamped with the
-- *writer's* id (auth.uid()) and a partner created it first, parent_id would be
-- the partner's id and the owner's SELECT (has_partner_access(owner, partner))
-- would fail — the owner wouldn't see the shared checklist.
--
-- Fix: always stamp parent_id with the child's owner (children.parent_id), so
-- the row is owner-keyed regardless of who writes it. Both write paths run as
-- SECURITY INVOKER, so the table's partner_can_write WITH CHECK still gates the
-- write (owner -> auth.uid() = parent_id; writing partner -> partner_can_write).
-- The children sub-select is also under the caller's RLS, so only someone with
-- access to the child can resolve the owner.

-- 1. Toggle one completed_items id atomically, owner-keyed on first insert.
CREATE OR REPLACE FUNCTION public.toggle_sleep_todo_item(
  p_child_id uuid,
  p_plan_date date,
  p_item text
)
RETURNS public.sleep_day_todos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.sleep_day_todos;
  v_owner uuid;
BEGIN
  SELECT parent_id INTO v_owner FROM public.children WHERE id = p_child_id;

  INSERT INTO public.sleep_day_todos (child_id, parent_id, plan_date, completed_items)
  VALUES (p_child_id, v_owner, p_plan_date, ARRAY[p_item])
  ON CONFLICT (child_id, plan_date) DO UPDATE
    SET completed_items = CASE
      WHEN p_item = ANY (public.sleep_day_todos.completed_items)
        THEN array_remove(public.sleep_day_todos.completed_items, p_item)
      ELSE array_append(public.sleep_day_todos.completed_items, p_item)
    END
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 2. Set the morning wake anchor, owner-keyed, without touching completed_items.
CREATE OR REPLACE FUNCTION public.set_sleep_todo_wake_anchor(
  p_child_id uuid,
  p_plan_date date,
  p_wake_anchor timestamptz
)
RETURNS public.sleep_day_todos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.sleep_day_todos;
  v_owner uuid;
BEGIN
  SELECT parent_id INTO v_owner FROM public.children WHERE id = p_child_id;

  INSERT INTO public.sleep_day_todos (child_id, parent_id, plan_date, wake_anchor)
  VALUES (p_child_id, v_owner, p_plan_date, p_wake_anchor)
  ON CONFLICT (child_id, plan_date) DO UPDATE
    SET wake_anchor = excluded.wake_anchor
  RETURNING * INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.set_sleep_todo_wake_anchor(uuid, date, timestamptz) IS
  'Sets sleep_day_todos.wake_anchor for the child/day, owner-keyed on insert, '
  'without touching completed_items. SECURITY INVOKER so RLS applies.';