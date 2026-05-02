-- Enable realtime on the three core log tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feeding_logs','sleep_logs','diaper_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;

-- Unified view for the family feed.
CREATE OR REPLACE VIEW public.family_moments AS
  SELECT id, child_id, parent_id AS author_id, logged_at AS occurred_at,
         'feed'::text AS kind,
         jsonb_build_object('amount_oz', amount_oz, 'method', method) AS payload,
         source
    FROM public.feeding_logs
  UNION ALL
  SELECT id, child_id, parent_id, started_at,
         'sleep'::text,
         jsonb_build_object('duration_min',
           EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))/60),
         source
    FROM public.sleep_logs
  UNION ALL
  SELECT id, child_id, parent_id, logged_at,
         'diaper'::text,
         jsonb_build_object('type', type),
         source
    FROM public.diaper_logs;

-- View inherits RLS from base tables; nothing extra needed.
GRANT SELECT ON public.family_moments TO authenticated;
