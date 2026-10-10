-- SECURITY: stop granting the public anon key rights on every new table, view
-- and sequence in `public`; strip anon from every existing relation except the
-- one logged-out flow that writes to a table (rights_requests INSERT).
--
-- Closes follow-up 1 of the 2026-10-08 legal-review-log entry ("SECURITY:
-- admin database functions ... family_moments"): "The default table
-- privileges still grant anon full rights on every new table and view in
-- public." That default is how public.family_moments (a definer view) ended
-- up readable with the anon key for ~5 months.
--
-- Verified on live (read-only, 2026-10-09, PostgreSQL 17.6) before writing:
--   * pg_default_acl, role postgres, schema public:
--       r (tables/views/matviews): {postgres, anon, authenticated, service_role}=arwdDxtm
--       S (sequences):             {postgres, anon, authenticated, service_role}=rwU
--     No global (schema-less) r / S entry for postgres, so the built-in
--     default applies globally (owner only; PUBLIC gets nothing on tables or
--     sequences). Schema-level defaults can only ADD to that, so revoking at
--     schema level is sufficient here.
--   * role supabase_admin has the same anon-granting r / S / f defaults in
--     public. postgres is not a member of supabase_admin and cannot change
--     them; only objects supabase_admin itself creates in public (platform
--     tooling, never our migrations) follow them. The end-of-file assertion
--     catches any such object that exists today.
--   * 74 relations in public, all owned by postgres, none extension-owned:
--     73 tables (every one with relrowsecurity = true) + 1 view
--     (family_moments, already security_invoker since 20261008020000). No
--     materialized views, foreign tables, partitioned tables or sequences.
--     No column-level ACLs.
--   * anon held arwdDxtm (incl. TRUNCATE and PG17 MAINTAIN) on 70 of the 73
--     tables; child_account_status, child_finance_finder and
--     finance_account_sponsors already had no anon grant.
--   * Only one RLS policy targets anon at all: rights_requests "Anyone can
--     submit a rights request" (INSERT). Every other policy is TO public and
--     pivots on auth.uid() / auth.uid()-pinned helpers, so anon already got
--     zero rows; the grant was dead weight, except for TRUNCATE (ignores RLS)
--     and any future table or view created without RLS.
--
-- Logged-out flows checked (src/pages, plus the SLP branch's
-- HomeProgramPage.tsx at ff6e606):
--   /auth            supabase.auth.* only. The post-signUp
--                    profiles.update({data_consent_given_at}) runs with no
--                    session when "Confirm email" is on; RLS (auth.uid() = id)
--                    already matched 0 rows for anon, and the call ignores
--                    its error, so it is a no-op before and after (it now
--                    returns 42501 instead of an empty update). Pre-existing
--                    gap, flagged in the legal log, not changed here.
--   /rights-request  rights_requests INSERT with return=minimal (no .select()),
--                    so anon needs INSERT only. Kept.
--   /vpc-confirm     RPC complete_vpc_second_confirmation (SECURITY DEFINER).
--   /hp/:token       RPCs get_home_program / toggle_home_program_day
--                    (SECURITY DEFINER, live only).
--   /invite/:code    redirects to /auth before any DB call.
--   legal pages, /reset-password, /upgrade, /subprocessors: no table access.
--   Edge functions: every anon-key client carries the caller's user JWT; the
--   mcp_* tables are touched only with the service-role client.
-- No table is read or written by an anon-role request besides rights_requests.
--
-- Re-audit before merge (read-only, 2026-10-10 UTC; numbers above unchanged):
--   * 20261008020000_security_hardening_anon_rpc IS applied on live (the
--     function lockdown this file mirrors for tables). Version 20261009000000
--     is still unused on live and on origin/main.
--   * Every relacl entry in public has grantor postgres, and every relation
--     is owned by postgres, so the REVOKEs below (run as postgres) take full
--     effect; a non-owner REVOKE would only warn and 4.1 / 4.3 would fail.
--   * The CI migrate job (Management API /database/query) runs as postgres
--     (non-superuser, member of anon / authenticated / service_role); checked
--     with current_user through the same API.
--   * Functions anon can execute: complete_vpc_second_confirmation,
--     get_home_program, toggle_home_program_day. All SECURITY DEFINER, owned
--     by postgres, so they read / write tables as the owner and are not
--     affected by anon losing table grants.
--   * mcp_* tables: only the mcp edge function's service-role `admin` client
--     touches them (grep src/ + supabase/functions); the client RPCs
--     list_my_mcp_connections / revoke_my_mcp_connection are SECURITY DEFINER
--     owned by postgres. mcp's user-data path mints an `authenticated` JWT.
--   * storage.objects policies reference no public table; all buckets are
--     private. No column ACLs, no sequences, no matviews in public.
--   * Edge logs, last 24h: zero non-OPTIONS /rest/v1/* requests with the
--     publishable key and no user JWT (anon role). Every non-authenticated
--     data request used the sb_secret_ (service_role) key.
--   * authenticated holds arwdDxtm on 72 tables, SELECT-only on
--     family_moments, SELECT + MAINTAIN on finance_account_sponsors.
-- Out of scope, flagged in the legal log: postgres's default ACL in the
-- `storage` schema also grants anon arwdDxtm on new tables (we never create
-- tables there), and supabase_admin's public defaults (not changeable by
-- postgres).
--
-- ---------------------------------------------------------------------------
-- DECISION: authenticated keeps SELECT / INSERT / UPDATE / DELETE by default.
--   New postgres-created tables in public grant authenticated exactly those
--   four privileges (no TRUNCATE / REFERENCES / TRIGGER / MAINTAIN). RLS stays
--   the access control for signed-in users. Going fully explicit for
--   authenticated as well would mean every table migration has to remember a
--   GRANT, and forgetting it ships a 42501 to every user on first use; this
--   project already ships one "forgot the grant" class (functions, since
--   20261008020000). The cost of keeping the four: a table created WITHOUT
--   RLS is readable / writable by every signed-in user. Mitigations: every
--   table convention here enables RLS, the security advisor flags
--   rls_disabled_in_public, and section 4 asserts RLS on every existing
--   table. anon, by contrast, gets nothing: no logged-out flow needs a new
--   table by default.
-- NEW CONVENTION:
--   New tables / views / sequences in public get NO anon privileges. Grant
--   anon explicitly, minimally, and only for a genuinely logged-out flow,
--   with a comment saying which page needs it. New views still need
--   WITH (security_invoker = true) and an explicit REVOKE ALL ... FROM anon,
--   authenticated; GRANT SELECT ... TO authenticated (see 20261008020000).
-- ---------------------------------------------------------------------------
--
-- Version 20261009000000: verified unused on live schema_migrations and in
-- origin/main supabase/migrations on 2026-10-09.
--
-- Idempotent: ALTER DEFAULT PRIVILEGES / REVOKE / GRANT are no-ops on re-run,
-- and section 3 regrants authenticated exactly the subset of
-- SELECT/INSERT/UPDATE/DELETE it already holds. Version-agnostic: nothing names
-- MAINTAIN (PG17-only); REVOKE ALL covers it on 17 and is valid on 16.
-- No transaction control here: the CI migrate job wraps the file in
-- BEGIN/COMMIT itself, so any RAISE EXCEPTION below rolls everything back.


-- ===========================================================================
-- 1. Root cause: default privileges for relations created by `postgres`.
-- ===========================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
-- authenticated: drop everything, then add back the four RLS-governed DML
-- privileges. Two statements so the result does not depend on which
-- privileges the old default happened to list (PG17 added MAINTAIN).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
-- Sequences for authenticated stay rwU: USAGE is needed to INSERT into a
-- serial column, and setval / currval are not reachable through PostgREST.


-- ===========================================================================
-- 2. Existing relations: no PUBLIC / anon access, except rights_requests INSERT.
-- ===========================================================================
DO $$
DECLARE
  _rel record;
BEGIN
  FOR _rel IN
    SELECT c.oid::regclass AS rel, c.relkind
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                        AND d.deptype = 'e')
  LOOP
    IF _rel.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon', _rel.rel);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon', _rel.rel);
    END IF;
  END LOOP;

  -- /rights-request (RightsRequestPage.tsx, linked from Privacy § 7) is a
  -- public form: a logged-out parent must be able to file a COPPA / state
  -- privacy request. INSERT only; the client sends return=minimal, so no
  -- SELECT is needed. RLS policy "Anyone can submit a rights request" pins
  -- status = 'received' and the admin columns to NULL.
  IF to_regclass('public.rights_requests') IS NOT NULL THEN
    GRANT INSERT ON public.rights_requests TO anon;
  END IF;
END
$$;


-- ===========================================================================
-- 3. Existing relations: authenticated keeps only SELECT/INSERT/UPDATE/DELETE.
-- ===========================================================================
-- Drops TRUNCATE (bypasses RLS), REFERENCES, TRIGGER and MAINTAIN, none of
-- which a client uses (PostgREST cannot issue TRUNCATE; no src / edge code
-- does). Per relation, authenticated is regranted exactly the DML subset it
-- already had, so deliberate restrictions survive (family_moments and
-- finance_account_sponsors are SELECT-only). The mcp_* tables get nothing:
-- RLS on with zero policies, written only by the mcp edge function's
-- service-role client, read by clients only via the SECURITY DEFINER RPCs
-- list_my_mcp_connections / revoke_my_mcp_connection.
DO $$
DECLARE
  _rel record;
  _keep text;
  _before text[];
  _after text[];
  _service_only text[] := ARRAY['mcp_clients', 'mcp_authorization_grants', 'mcp_access_tokens'];
BEGIN
  -- Snapshot of authenticated's DML grants, for the preservation check below.
  SELECT coalesce(array_agg(c.relname || ':' || x.privilege_type ORDER BY c.relname, x.privilege_type), '{}')
  INTO _before
  FROM pg_class c, LATERAL aclexplode(c.relacl) x
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND x.grantee = 'authenticated'::regrole
    AND x.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    AND c.relname <> ALL (_service_only);

  FOR _rel IN
    SELECT c.oid::regclass AS rel, c.relname,
           (SELECT string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type)
            FROM aclexplode(c.relacl) x
            WHERE x.grantee = 'authenticated'::regrole
              AND x.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) AS dml
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relacl IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                        AND d.deptype = 'e')
  LOOP
    _keep := CASE WHEN _rel.relname = ANY (_service_only) THEN NULL ELSE _rel.dml END;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM authenticated', _rel.rel);
    IF _keep IS NOT NULL THEN
      EXECUTE format('GRANT %s ON TABLE %s TO authenticated', _keep, _rel.rel);
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(c.relname || ':' || x.privilege_type ORDER BY c.relname, x.privilege_type), '{}')
  INTO _after
  FROM pg_class c, LATERAL aclexplode(c.relacl) x
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND x.grantee = 'authenticated'::regrole
    AND x.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    AND c.relname <> ALL (_service_only);

  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'default_table_privileges: authenticated DML grants changed (before %, after %)',
      _before, _after;
  END IF;
END
$$;


-- ===========================================================================
-- 4. Assertions. Any failure rolls back the whole migration.
-- ===========================================================================
DO $$
DECLARE
  _bad text;
BEGIN
  -- 4.1 No public relation grants anything to PUBLIC or anon, except
  --     rights_requests INSERT for anon.
  SELECT string_agg(c.relname || ':' || x.privilege_type || '->' ||
                    CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ', ')
  INTO _bad
  FROM pg_class c, LATERAL aclexplode(c.relacl) x
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND x.grantee IN (0, 'anon'::regrole)
    AND NOT (c.relname = 'rights_requests' AND x.grantee = 'anon'::regrole
             AND x.privilege_type = 'INSERT');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: still granted to PUBLIC/anon: %', _bad;
  END IF;

  -- Column-level grants to PUBLIC / anon would bypass 4.1.
  SELECT string_agg(c.relname || '.' || a.attname, ', ') INTO _bad
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  CROSS JOIN LATERAL aclexplode(a.attacl) x
  WHERE c.relnamespace = 'public'::regnamespace
    AND x.grantee IN (0, 'anon'::regrole);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: column grants to PUBLIC/anon: %', _bad;
  END IF;

  -- 4.2 The one logged-out table flow still works.
  IF to_regclass('public.rights_requests') IS NOT NULL
     AND NOT has_table_privilege('anon', 'public.rights_requests', 'INSERT') THEN
    RAISE EXCEPTION 'default_table_privileges: anon lost INSERT on rights_requests';
  END IF;

  -- 4.3 authenticated holds nothing beyond SELECT/INSERT/UPDATE/DELETE on any
  --     public table / view (no TRUNCATE, REFERENCES, TRIGGER, MAINTAIN), and
  --     nothing at all on the service-role-only mcp_* tables.
  SELECT string_agg(c.relname || ':' || x.privilege_type, ', ') INTO _bad
  FROM pg_class c, LATERAL aclexplode(c.relacl) x
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND x.grantee = 'authenticated'::regrole
    AND (x.privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
         OR c.relname IN ('mcp_clients', 'mcp_authorization_grants', 'mcp_access_tokens'));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: authenticated still holds: %', _bad;
  END IF;

  -- 4.4 Default ACL for postgres in public: no anon / PUBLIC on tables or
  --     sequences; authenticated on tables = exactly SELECT/INSERT/UPDATE/DELETE.
  --     Global (schema-less) entries must not grant them anything either.
  SELECT string_agg(a.defaclobjtype::text || ':' || x.privilege_type || '->' ||
                    CASE x.grantee WHEN 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ', ')
  INTO _bad
  FROM pg_default_acl a, LATERAL aclexplode(a.defaclacl) x
  WHERE a.defaclrole = 'postgres'::regrole
    AND a.defaclnamespace IN (0, 'public'::regnamespace)
    AND a.defaclobjtype IN ('r', 'S')
    AND (x.grantee IN (0, 'anon'::regrole)
         OR (x.grantee = 'authenticated'::regrole AND a.defaclobjtype = 'r'
             AND x.privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
         OR (x.grantee = 'authenticated'::regrole AND a.defaclnamespace = 0));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: default ACL still grants: %', _bad;
  END IF;

  IF (SELECT count(*)
      FROM pg_default_acl a, LATERAL aclexplode(a.defaclacl) x
      WHERE a.defaclrole = 'postgres'::regrole
        AND a.defaclnamespace = 'public'::regnamespace
        AND a.defaclobjtype = 'r'
        AND x.grantee = 'authenticated'::regrole
        AND x.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) <> 4 THEN
    RAISE EXCEPTION 'default_table_privileges: authenticated default table grants are not SELECT/INSERT/UPDATE/DELETE';
  END IF;

  -- 4.5 Every view a client can read runs as the querying user. A definer
  --     view owned by postgres (BYPASSRLS) ignores RLS: the family_moments
  --     bug. Materialized views cannot be security_invoker, so any client
  --     grant on one fails here too.
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('v', 'm')
    AND (has_table_privilege('anon', c.oid, 'SELECT')
         OR has_table_privilege('authenticated', c.oid, 'SELECT'))
    AND NOT (c.relkind = 'v'
             AND coalesce(c.reloptions, '{}') && ARRAY['security_invoker=true', 'security_invoker=on', 'security_invoker=1']);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: client-readable view without security_invoker: %', _bad;
  END IF;

  -- 4.6 RLS is enabled on every public table.
  SELECT string_agg(c.relname, ', ') INTO _bad
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'p')
    AND NOT c.relrowsecurity;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'default_table_privileges: RLS disabled on: %', _bad;
  END IF;
END
$$;
