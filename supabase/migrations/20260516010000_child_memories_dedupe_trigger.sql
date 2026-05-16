-- BEFORE INSERT dedupe trigger for `public.child_memories`.
--
-- The `extract-memory` edge function already runs an in-memory dedupe against
-- the last 50 rows per child. That heuristic silently weakens once a child
-- accumulates >50 memories: the 51st-and-older row never appears in the
-- comparison set, so the same fact ("loves peekaboo", "peanut-allergic") can
-- be re-extracted and re-inserted indefinitely from briefing / weekly
-- summaries / repeated chat mentions.
--
-- This trigger closes the loop at the DB level: if a row with the same
-- `child_id`, `category`, and case-insensitive `content` already exists
-- within the last 30 days, the INSERT is skipped (returning NULL from a
-- BEFORE INSERT trigger cancels the row insert silently). 30 days matches
-- the window described in the PR / plan for the per-child memory feature.
--
-- SECURITY DEFINER + immutable search_path so RLS doesn't shadow the
-- comparison SELECT — the trigger needs to see ALL rows for the child, not
-- the RLS-filtered subset visible to the calling user.

CREATE OR REPLACE FUNCTION public.dedupe_child_memory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.child_memories
     WHERE child_id = NEW.child_id
       AND category = NEW.category
       AND lower(content) = lower(NEW.content)
       AND created_at > now() - interval '30 days'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dedupe_child_memory ON public.child_memories;
CREATE TRIGGER dedupe_child_memory
  BEFORE INSERT ON public.child_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.dedupe_child_memory();
