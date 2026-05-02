-- Enable Supabase Realtime on partner_invitations so the inviter can
-- watch for the moment their partner accepts.

ALTER TABLE public.partner_invitations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'partner_invitations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_invitations;
  END IF;
END$$;
