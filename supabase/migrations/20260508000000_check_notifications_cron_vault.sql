-- Switch the `check-notifications-every-3h` pg_cron job to read its
-- service_role key from Supabase Vault.
--
-- Why: the prior schedule (created during initial setup) embedded a hardcoded
-- LEGACY anon JWT in the command body. After the May-2026 service_role leak
-- the JWT secret was rotated, which silently breaks any cron that pinned the
-- old token. Switching to vault.decrypted_secrets keeps this cron in lockstep
-- with `inactive-account-purge-daily` and `reactivate-nudge-3x-daily`, both of
-- which were migrated to the Vault pattern in 20260507050000.
--
-- Pre-requisites (already done as part of 20260507050000):
--   SELECT vault.create_secret('https://<project>.supabase.co', 'app_supabase_url');
--   SELECT vault.create_secret('<sb_secret_...>', 'app_service_role_key');

DO $vault_setup$
BEGIN
  PERFORM cron.unschedule('check-notifications-every-3h')
  FROM cron.job WHERE jobname = 'check-notifications-every-3h';
EXCEPTION WHEN undefined_function THEN
  NULL;
END
$vault_setup$;

SELECT cron.schedule(
  'check-notifications-every-3h',
  '0 */3 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_supabase_url') || '/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);
