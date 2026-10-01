-- SECURITY: lock the internal / admin SECURITY DEFINER RPCs to service_role.
--
-- On this project, pg_default_acl grants EXECUTE on every new function in
-- `public` DIRECTLY to anon, authenticated and service_role (not only via
-- PUBLIC). So the `REVOKE ALL ... FROM PUBLIC` lines in the migrations that
-- created these functions removed nothing. Verified on live 2026-09-30 with
-- has_function_privilege('anon', oid, 'EXECUTE') = true for all three. Every
-- one was reachable anonymously at POST /rest/v1/rpc/<name> with only the
-- public anon key:
--
--   _purge_user_data(uuid)
--       Deletes every row for an arbitrary user id and then the auth.users
--       row. No auth.uid() check, by design ("that's the caller's job").
--       Exposed since 20260507040000_inactive_account_purge.sql (applied to
--       live as 20260507151347). The redefinition in 20260509000000 kept the
--       same ACL.
--   purge_inactive_account(uuid)
--       A thin wrapper around _purge_user_data. Same exposure, same migration.
--   users_with_no_logs_since(timestamptz)
--       Returns (parent user_id, child_id, child first name) for every child
--       with no feed/sleep/diaper log since the given time. Passing a future
--       timestamp returns EVERY child in the database. It never had a REVOKE
--       at all. Exposed since 20260502010000_reactivation_rpc.sql. It also
--       yields the user ids that _purge_user_data takes.
--
-- Legitimate callers (all keep working after this migration):
--   * supabase/functions/reactivate-nudge -> sb.rpc("users_with_no_logs_since")
--     using SUPABASE_SERVICE_ROLE_KEY (service_role keeps EXECUTE).
--   * supabase/functions/inactive-account-purge -> admin.rpc("purge_inactive_account")
--     using SUPABASE_SERVICE_ROLE_KEY (service_role keeps EXECUTE).
--   * public.delete_user_account() and public.purge_inactive_account() call
--     _purge_user_data internally. Both are SECURITY DEFINER owned by
--     `postgres`, so the inner call is checked against postgres (the owner),
--     not the end user, and needs no grant to authenticated.
--     delete-account (edge) -> userClient.rpc("delete_user_account"), which is
--     NOT changed here.
--   * pg_cron: the three jobs (check-notifications-every-3h,
--     inactive-account-purge-daily, reactivate-nudge-3x-daily) only
--     net.http_post to edge functions with the Vault service-role key. None of
--     them calls these functions directly.
--   * No client code (src/**) calls any of the three.
--
-- Idempotent: REVOKE/GRANT are no-ops on re-run. Each function is skipped
-- when it does not exist (fresh or partial environments). The trailing
-- assertion fails the migration if any of the three is still executable by
-- anon or authenticated, or is not executable by service_role.

DO $$
DECLARE
  _sig text;
  _fn regprocedure;
BEGIN
  FOREACH _sig IN ARRAY ARRAY[
    'public._purge_user_data(uuid)',
    'public.purge_inactive_account(uuid)',
    'public.users_with_no_logs_since(timestamptz)'
  ] LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NULL THEN
      RAISE NOTICE 'lock_down_admin_rpcs: % not present, skipping', _sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', _fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', _fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', _fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', _fn);

    IF has_function_privilege('anon', _fn, 'EXECUTE')
       OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'lock_down_admin_rpcs: % is still executable by anon/authenticated', _sig;
    END IF;
    IF NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'lock_down_admin_rpcs: % is not executable by service_role', _sig;
    END IF;
  END LOOP;
END
$$;
