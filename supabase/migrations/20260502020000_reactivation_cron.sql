-- Schedule the reactivate-nudge edge function 3x daily at safe UTC times
-- (00:00, 12:00, 18:00) — maps to ~8p/8a/2p US Eastern, never overnight.
-- pg_cron + pg_net are already enabled (20260406014912_*).
--
-- Requires app.supabase_url and app.service_role_key to be set on the DB.
-- If those aren't configured, set them via:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<project>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<service-role-jwt>';
-- (Run as superuser; values must persist across reconnects.)

DO $$
BEGIN
  -- If the job already exists from a prior run, unschedule it first
  PERFORM cron.unschedule('reactivate-nudge-3x-daily')
  FROM cron.job WHERE jobname = 'reactivate-nudge-3x-daily';
EXCEPTION WHEN undefined_function THEN
  -- pg_cron not available locally; ignore
  NULL;
END$$;

SELECT cron.schedule(
  'reactivate-nudge-3x-daily',
  '0 0,12,18 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/reactivate-nudge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);
