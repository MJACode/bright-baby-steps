-- Send the cron secret key on the `apikey` header for the three pg_cron jobs
-- that call edge functions.
--
-- Why: the jobs sent `Authorization: Bearer <vault app_service_role_key>`.
-- New-style secret keys (sb_secret_...) are not JWTs: on the Authorization
-- header the platform tries to parse them as a JWT and rejects the request,
-- and verify_jwt only understands legacy JWT keys. Supabase's documented
-- pattern is the secret key on `apikey`, verify_jwt = false, and an in-function
-- check. The functions now verify the key named `cron` from
-- SUPABASE_SECRET_KEYS (supabase/functions/_shared/requireCronKey.ts).
--
-- Schedules and bodies are unchanged from live cron.job as of 2026-10-03:
--   inactive-account-purge-daily   '30 2 * * *'      no body (pg_net default '{}')
--   reactivate-nudge-3x-daily      '0 0,12,18 * * *'  no body (pg_net default '{}')
--   check-notifications-every-3h   '0 */3 * * *'      body '{}'::jsonb
--
-- PRE-REQUISITE (founder, before applying): create a secret API key named
-- `cron` in Dashboard > Settings > API keys, then put its full value in Vault:
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'app_service_role_key'),
--     '<sb_secret_... full value>');
-- The guard below refuses to apply while Vault still holds anything that is
-- not a well-formed sb_secret_ key (a legacy JWT, or the dashboard's masked
-- preview with U+00B7 dots), because the deployed functions only accept the
-- `cron` key and every scheduled run would 401.
--
-- Idempotent: unschedule-if-exists then schedule; re-running is a no-op in
-- effect.

DO $guard$
DECLARE
  _k text;
BEGIN
  SELECT decrypted_secret INTO _k
  FROM vault.decrypted_secrets WHERE name = 'app_service_role_key';

  IF _k IS NULL THEN
    RAISE EXCEPTION 'vault secret app_service_role_key is missing';
  END IF;
  IF octet_length(_k) <> length(_k) OR _k !~ '^sb_secret_[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'vault secret app_service_role_key is not a well-formed sb_secret_ key (length %, octets %). Store the full `cron` secret key first.',
      length(_k), octet_length(_k);
  END IF;
END
$guard$;

DO $unschedule$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'inactive-account-purge-daily',
    'reactivate-nudge-3x-daily',
    'check-notifications-every-3h'
  );
END
$unschedule$;

SELECT cron.schedule(
  'inactive-account-purge-daily',
  '30 2 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_supabase_url') || '/functions/v1/inactive-account-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key')
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
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key')
    )
  );
  $job$
);

SELECT cron.schedule(
  'check-notifications-every-3h',
  '0 */3 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_supabase_url') || '/functions/v1/check-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
