-- Voice-parse abuse counter.
--
-- Voice logging is FREE for all users (no Flare+ gate), so parse-voice-log
-- needs a generous per-user abuse cap instead of a premium check: 50 parses
-- per user per UTC day. This table is the counter — one row per successful
-- parse request, counted by the edge function before each parse.
--
-- Purge path: user_id references auth.users ON DELETE CASCADE, so rows are
-- removed transitively by the final `DELETE FROM auth.users` in
-- _purge_user_data() (same pattern as other auth-cascading tables — see
-- lessons 2026-05-24; do NOT redefine delete_user_account() here).
--
-- RLS: the edge function authenticates the caller and uses the caller's
-- session client (anon key + Authorization header), so the table needs
-- explicit self-scoped INSERT/SELECT policies. No UPDATE/DELETE policies —
-- clients never mutate the audit trail.

CREATE TABLE IF NOT EXISTS public.voice_parse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_parse_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'voice_parse_events'
      AND policyname = 'Users can insert own voice parse events'
  ) THEN
    CREATE POLICY "Users can insert own voice parse events"
      ON public.voice_parse_events FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'voice_parse_events'
      AND policyname = 'Users can view own voice parse events'
  ) THEN
    CREATE POLICY "Users can view own voice parse events"
      ON public.voice_parse_events FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_voice_parse_events_user_created
  ON public.voice_parse_events(user_id, created_at DESC);
