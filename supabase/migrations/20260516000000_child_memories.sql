-- Per-child AI memory store.
--
-- Memories are durable facts about a specific child (or the parent's
-- persistent preferences scoped to that child) that the AI surfaces back into
-- chat / briefing / weekly-insights context blocks. Auto-extracted by the
-- `extract-memory` edge function after each AI turn on those three surfaces;
-- can also be created manually from the AI Memory settings page.
--
-- Access pattern mirrors all other child-scoped data: primary parent + any
-- active partner via `public.can_access_child(auth.uid(), child_id)`. No
-- per-user / per-partner private split.
--
-- Deletion path: `children ON DELETE CASCADE` covers everything, so this table
-- does NOT need its own entry in `delete_user_account()` — the cascade from
-- the children-row delete handles it transitively. (Per lessons-backend.md
-- 2026-05-07 — that rule is about `parent_id`-referencing tables; this one
-- references `child_id` only.)

CREATE TABLE IF NOT EXISTS public.child_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('preference','trait','routine','concern','goal','context')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500),
  source_function text CHECK (source_function IN ('chat','briefing','weekly-insights','manual')),
  confidence real CHECK (confidence >= 0 AND confidence <= 1),
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_referenced_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_child_memories_child_pinned_created
  ON public.child_memories (child_id, pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_child_memories_child_category
  ON public.child_memories (child_id, category);

-- Reuse the existing `public.update_updated_at()` helper (defined in
-- 20260322213259_*.sql). Do not redefine it here.
DROP TRIGGER IF EXISTS update_child_memories_updated_at ON public.child_memories;
CREATE TRIGGER update_child_memories_updated_at
  BEFORE UPDATE ON public.child_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.child_memories ENABLE ROW LEVEL SECURITY;

-- Policies — all gated on `public.can_access_child(auth.uid(), child_id)`.
-- INSERT additionally locks `created_by` to the caller.
DROP POLICY IF EXISTS child_memories_select ON public.child_memories;
CREATE POLICY child_memories_select
  ON public.child_memories
  FOR SELECT
  USING (public.can_access_child(auth.uid(), child_id));

DROP POLICY IF EXISTS child_memories_insert ON public.child_memories;
CREATE POLICY child_memories_insert
  ON public.child_memories
  FOR INSERT
  WITH CHECK (
    public.can_access_child(auth.uid(), child_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS child_memories_update ON public.child_memories;
CREATE POLICY child_memories_update
  ON public.child_memories
  FOR UPDATE
  USING (public.can_access_child(auth.uid(), child_id))
  WITH CHECK (public.can_access_child(auth.uid(), child_id));

DROP POLICY IF EXISTS child_memories_delete ON public.child_memories;
CREATE POLICY child_memories_delete
  ON public.child_memories
  FOR DELETE
  USING (public.can_access_child(auth.uid(), child_id));
