-- Per-nap time overrides for the per-day sleep to-do checklist.
--
-- sleep_day_todos has one row per (child_id, plan_date). It already stores the
-- morning wake_anchor and the set of completed_items. This migration adds a
-- nap_overrides jsonb column so a parent can hand-tune predicted nap/bedtime
-- times and have those edits survive refresh + sync to partners.
--
-- nap_overrides maps item-id (text) -> ISO timestamp (the parent-chosen time
-- for that predicted nap/bedtime). Default '{}'::jsonb means "no overrides;
-- use the plan-derived predicted times".
--
-- Existing RLS already covers the new column (SELECT has_partner_access, write
-- partner_can_write), so this migration adds NO new policies and NO new indexes.
--
-- Deletion path is unchanged: nap_overrides lives on the existing row, which is
-- cascade-deleted with the child (child_id ON DELETE CASCADE) or the auth user
-- (parent_id ON DELETE CASCADE). It needs NO new line in delete_user_account().

ALTER TABLE public.sleep_day_todos
  ADD COLUMN IF NOT EXISTS nap_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Set (or clear) one predicted-time override, owner-keyed, without touching
-- wake_anchor or completed_items. Mirrors set_sleep_todo_wake_anchor's
-- owner-keying and return convention. Single-key jsonb ops so concurrent edits
-- to different keys don't collide.
--   p_time IS NULL  -> remove the key (insert path starts from '{}')
--   otherwise       -> merge the single key (insert path is just that key)
CREATE OR REPLACE FUNCTION public.set_sleep_todo_item_time(
  p_child_id uuid,
  p_plan_date date,
  p_item text,
  p_time timestamptz
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

  INSERT INTO public.sleep_day_todos (child_id, parent_id, plan_date, nap_overrides)
  VALUES (
    p_child_id,
    v_owner,
    p_plan_date,
    CASE
      WHEN p_time IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object(p_item, p_time)
    END
  )
  ON CONFLICT (child_id, plan_date) DO UPDATE
    SET nap_overrides = CASE
      WHEN p_time IS NULL
        THEN public.sleep_day_todos.nap_overrides - p_item
      ELSE public.sleep_day_todos.nap_overrides || jsonb_build_object(p_item, p_time)
    END
  RETURNING * INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.set_sleep_todo_item_time(uuid, date, text, timestamptz) IS
  'Sets (or clears, when p_time IS NULL) one sleep_day_todos.nap_overrides key '
  'for the child/day, owner-keyed on insert, without touching wake_anchor or '
  'completed_items. Single-key jsonb ops avoid collisions between concurrent '
  'edits to different keys. SECURITY INVOKER so RLS applies.';
