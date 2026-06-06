-- Atomic toggle for sleep_day_todos.completed_items.
--
-- The client previously read the whole completed_items array from cached state,
-- flipped one id, and upserted the rewritten array — a read-modify-write that
-- drops a concurrent check-off (two fast taps, or two partners) because the
-- second write clobbers the first. This RPC makes the toggle a single atomic
-- statement so concurrent toggles serialize on the server against fresh state.
--
-- SECURITY INVOKER: runs as the caller, so the table's RLS (partner_can_write
-- on INSERT/UPDATE) is enforced exactly as for a direct write. parent_id is set
-- to auth.uid() on first insert, matching the convention used elsewhere
-- (sleep_logs, sleep_day_todos direct upserts).

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
BEGIN
  INSERT INTO public.sleep_day_todos (child_id, parent_id, plan_date, completed_items)
  VALUES (p_child_id, auth.uid(), p_plan_date, ARRAY[p_item])
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

COMMENT ON FUNCTION public.toggle_sleep_todo_item(uuid, date, text) IS
  'Atomically toggles one item id in sleep_day_todos.completed_items for the '
  'given child/day, inserting the row if absent. SECURITY INVOKER so RLS '
  'applies. Avoids the read-modify-write lost-update race in the client.';