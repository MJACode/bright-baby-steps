-- Chat entry-point attribution.
--
-- Adds a nullable `source` column to chat_conversations so the client can
-- record which surface started the conversation (e.g. 'chat_page',
-- 'quick_log', 'briefing_followup') for chat-usage analytics. Nullable text,
-- no CHECK constraint — entry points will evolve and the value is
-- analytics-only, never branched on server-side.
--
-- No RLS changes: the column rides the existing per-row
-- "Users can manage own conversations" policy (auth.uid() = user_id).

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS source text;
