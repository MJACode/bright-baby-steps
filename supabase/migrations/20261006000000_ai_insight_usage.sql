-- ai_insight_usage: one row per AI insight started, for free-tier daily quotas.
--
-- Why: the `chat` edge function's free limit (10/day) counted chat_messages,
-- which nothing has written since the chat UI was removed (2026-08-28), so the
-- limit never fired. As of 2026-10-06 `chat` serves only the Word Journal
-- speech insight and counts rows here instead (kind = 'word_journal_insight').
--
-- RLS: a user can read and insert their own rows only. No UPDATE or DELETE
-- policy, so a client can't clear its own count to reset the quota.
-- Deletion: rows go with the user (auth.users cascade) and with the child.

CREATE TABLE IF NOT EXISTS public.ai_insight_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.children(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_insight_usage_user_kind_created_idx
  ON public.ai_insight_usage (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_insight_usage_child_idx
  ON public.ai_insight_usage (child_id);

ALTER TABLE public.ai_insight_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own insight usage" ON public.ai_insight_usage;
CREATE POLICY "Users read own insight usage"
  ON public.ai_insight_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users record own insight usage" ON public.ai_insight_usage;
CREATE POLICY "Users record own insight usage"
  ON public.ai_insight_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (child_id IS NULL OR public.can_access_child(auth.uid(), child_id)));
