-- Switch pg_cron jobs from current_setting() to Supabase Vault.
--
-- Why: hosted Supabase projects don't grant ALTER DATABASE to the SQL editor
-- role, so the prior 20260502020000_reactivation_cron.sql + the new
-- 20260507040000_inactive_account_purge.sql instructions to run
--   ALTER DATABASE postgres SET app.supabase_url = '...';
--   ALTER DATABASE postgres SET app.service_role_key = '...';
-- fail with "permission denied to set parameter". This migration is the
-- replacement: store the same two values in Vault and have the cron jobs
-- read from vault.decrypted_secrets.
--
-- Pre-requisites (run once via the SQL editor; values do NOT belong in this
-- migration file):
--   SELECT vault.create_secret('https://<project>.supabase.co', 'app_supabase_url');
--   SELECT vault.create_secret('<sb_secret_...>', 'app_service_role_key');
--
-- Verify:
--   SELECT name FROM vault.secrets WHERE name IN ('app_supabase_url', 'app_service_role_key');

DO $vault_setup$
BEGIN
  PERFORM cron.unschedule('inactive-account-purge-daily')
  FROM cron.job WHERE jobname = 'inactive-account-purge-daily';
  PERFORM cron.unschedule('reactivate-nudge-3x-daily')
  FROM cron.job WHERE jobname = 'reactivate-nudge-3x-daily';
EXCEPTION WHEN undefined_function THEN
  NULL;
END
$vault_setup$;

SELECT cron.schedule(
  'inactive-account-purge-daily',
  '30 2 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_supabase_url') || '/functions/v1/inactive-account-purge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $job$
);

SELECT cron.schedule(
  'reactivate-nudge-3x-daily',
  '0 0,12,18 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_supabase_url') || '/functions/v1/reactivate-nudge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $job$
);
