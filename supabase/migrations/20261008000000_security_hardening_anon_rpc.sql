-- SECURITY: pre-launch hardening of anon-reachable database surface.
--
-- Closes the Supabase security-advisor findings open on 2026-10-08 and the
-- 2026-09-30 audit follow-ups 1-3 in docs/legal-review-log.md
-- ("SECURITY: admin database functions were callable with the public anon
-- key"). Follow-up 4 (can_access_child had no auth.uid() guard) was already
-- closed on live by 20260930100000_free_partner_seat.sql; section 5 below
-- asserts the guard is still in place, because the authenticated grant on the
-- RLS helpers is only safe while it is.
--
-- Verified on live (read-only, 2026-10-08) before writing this file:
--   * Every function in `public` is owned by `postgres`; migrations (CI
--     `migrate` job -> Management API /database/query, and MCP) run as
--     `postgres`.
--   * pg_default_acl for role postgres, schema public, functions:
--     {postgres=X, anon=X, authenticated=X, service_role=X}. There is no global
--     (schema-less) entry, so the built-in default PUBLIC=X also applies.
--     Result: every new public function was callable by the anon key.
--   * public.family_moments: plain view (no security_invoker), owner postgres
--     (rolbypassrls = true, and owner of the base tables), relacl grants anon
--     SELECT. `SET ROLE anon; SELECT count(*) FROM family_moments` returned
--     772 rows across 2 children: every feed / sleep / diaper row in the
--     database (child_id, author_id, timestamps, amount_oz, feeding_type,
--     sleep duration, diaper_type, source) was readable with the public anon
--     key, bypassing RLS. Exposed since 20260501020000_family_moments.sql.
--
-- ---------------------------------------------------------------------------
-- NEW CONVENTION (consequence of section 1):
--   New functions in `public` are no longer executable by PUBLIC, anon or
--   authenticated by default. Every migration that adds a client-callable RPC
--   (supabase.rpc(...) from src/**, or an edge function using the user's JWT),
--   or a helper referenced from an RLS policy, MUST end with
--     GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;
--   and, only for a token-based flow that genuinely works logged-out, `anon`
--   too, with a comment saying why. Trigger functions need no grant (firing a
--   trigger does not check EXECUTE). service_role keeps EXECUTE by default.
--   Functions created by `supabase_admin` (platform-managed) still follow
--   supabase_admin's own default ACL, which `postgres` cannot alter.
-- ---------------------------------------------------------------------------
--
-- Idempotent: ALTER DEFAULT PRIVILEGES / REVOKE / GRANT / ALTER VIEW SET /
-- ALTER FUNCTION SET are no-ops on re-run. Every function is resolved with
-- to_regprocedure() and skipped when absent (several exist only on live, e.g.
-- the SLP-branch functions start_pro_trial / get_home_program /
-- toggle_home_program_day, whose migrations are not on main). The final block
-- asserts the end state and rolls the whole migration back on any mismatch.
-- No transaction control here: the CI migrate job wraps the file in
-- BEGIN/COMMIT itself.


-- ===========================================================================
-- 1. Root cause: default privileges for functions created by `postgres`.
-- ===========================================================================
-- Schema-level default ACLs can only ADD to the global default, so the
-- built-in PUBLIC=X has to be removed with a global (no IN SCHEMA) entry; the
-- schema-level REVOKE removes the explicit anon / authenticated grants.
-- service_role keeps its schema-level default grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;


-- ===========================================================================
-- 2. public.family_moments -> security_invoker; no anon access.
-- ===========================================================================
-- Consumer: src/hooks/useFamilyMoments.tsx (FamilyMomentsCard on
-- CaregiverHome), signed-in only: owner and partners. With security_invoker
-- the base tables' RLS applies as the querying user:
--   feeding_logs / sleep_logs / diaper_logs SELECT policy
--   `can_access_child(auth.uid(), child_id)` = owner OR active partner within
--   the owner's entitlement. That is exactly what the same users already get
--   when they read those tables directly, so the owner and every entitled
--   partner keep seeing the feed. authenticated keeps SELECT on the three base
--   tables (default table ACL) and EXECUTE on can_access_child (section 4).
-- Intended behaviour change: a partner whose access is paused / revoked /
-- outside the owner's Flare+ entitlement no longer sees moments through the
-- view (the definer view ignored RLS for them too).
-- The view is a UNION ALL, so it is not auto-updatable; only SELECT is kept.
DO $$
BEGIN
  IF to_regclass('public.family_moments') IS NULL THEN
    RAISE NOTICE 'security_hardening: public.family_moments not present, skipping';
    RETURN;
  END IF;
  ALTER VIEW public.family_moments SET (security_invoker = true);
  REVOKE ALL ON public.family_moments FROM PUBLIC, anon;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.family_moments FROM authenticated;
  GRANT SELECT ON public.family_moments TO authenticated;
END
$$;


-- ===========================================================================
-- 3. touch_ai_memories_updated_at: pin search_path (advisor 0011).
-- ===========================================================================
DO $$
BEGIN
  IF to_regprocedure('public.touch_ai_memories_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.touch_ai_memories_updated_at() SET search_path = public;
  END IF;
END
$$;


-- ===========================================================================
-- 4. Function EXECUTE grants.
-- ===========================================================================
-- 4a. Sweep (catalog-derived, so live-only functions are covered too):
--     * every non-extension function in `public`: revoke from PUBLIC and anon;
--     * every trigger function: also revoke from authenticated. Triggers fire
--       without an EXECUTE check, so this cannot break them. Covers
--       handle_new_user, handle_new_user_subscription,
--       sync_email_confirmation_to_vpc (auth.users), enforce_vpc_on_child_insert,
--       dedupe_child_memory, touch_ai_memories_updated_at, update_updated_at,
--       enforce_sleep_method_safety, plus the ones already locked down.
--     service_role is not touched.
-- 4b. Re-grant authenticated on the explicit allowlist below (exact
--     signatures).
-- 4c. Re-grant anon on the logged-out token flows below (exact signatures).
DO $$
DECLARE
  _fn regprocedure;
  _sig text;
BEGIN
  -- 4a
  FOR _fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', _fn);
  END LOOP;

  FOR _fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', _fn);
  END LOOP;

  -- 4b. authenticated (signed-in) only.
  FOREACH _sig IN ARRAY ARRAY[
    -- RLS helpers. Referenced from policies (TO public / TO authenticated), which
    -- evaluate as the querying role, so authenticated must keep EXECUTE. Each
    -- is pinned to auth.uid() (asserted in section 5), so calling one directly
    -- over PostgREST only answers questions about the caller.
    'public.can_access_child(uuid,uuid)',
    'public.can_write_child(uuid,uuid)',
    'public.has_partner_access(uuid,uuid)',
    'public.partner_can_write(uuid)',           -- also generate-sign-plan (user JWT)
    'public.can_manage_child_finance(uuid)',    -- child_finance_finder / child_account_status policies
    -- Client RPCs (src/**) and user-JWT edge-function calls.
    'public.lookup_partner_invitation(text)',   -- AcceptInvite.tsx; only after login (redirects to /auth first)
    'public.accept_partner_invitation(text)',   -- AcceptInvite.tsx
    'public.set_partner_access_paused(uuid,boolean)', -- PartnerManagement.tsx
    'public.set_partner_role(uuid,text)',       -- owner-only RPC (20260930110000); no src caller today
    'public.list_my_mcp_connections()',         -- useMcpConnections.ts
    'public.revoke_my_mcp_connection(uuid)',    -- useMcpConnections.ts
    'public.delete_user_account()',             -- delete-account edge fn, user JWT
    'public.start_pro_trial()',                 -- SLP branch (not on main); live only
    -- MCP read tools: SECURITY INVOKER; called by the `mcp` edge function with a
    -- minted role=authenticated JWT (_shared/mintUserJwt.ts), RLS applies.
    'public.list_accessible_children()',
    'public.get_child_profile(uuid)',
    'public.get_recent_sleep(uuid,integer)',
    'public.get_recent_feeds(uuid,integer)',
    'public.get_recent_diapers(uuid,integer)',
    'public.get_growth(uuid)',
    'public.get_milestones(uuid,text)',
    'public.get_illnesses(uuid,boolean)',
    'public.get_vaccinations(uuid,boolean)',
    'public.get_allergens(uuid)',
    'public.get_summary(uuid,integer)',
    -- Sleep to-do RPCs: SECURITY INVOKER, RLS applies; no src caller today.
    'public.toggle_sleep_todo_item(uuid,date,text)',
    'public.set_sleep_todo_wake_anchor(uuid,date,timestamptz)',
    'public.set_sleep_todo_item_time(uuid,date,text,timestamptz)'
  ] LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NULL THEN
      RAISE NOTICE 'security_hardening: % not present, skipping', _sig;
      CONTINUE;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', _fn);
  END LOOP;

  -- 4c. anon + authenticated: token-based flows that must work logged-out.
  FOREACH _sig IN ARRAY ARRAY[
    -- /vpc-confirm (VpcConfirmPage.tsx) has no auth gate: the COPPA email #2
    -- link is often opened on another device / browser with no session. The
    -- token is the credential (>= 16 chars, single-use, expiring).
    'public.complete_vpc_second_confirmation(text)',
    -- SLP branch (not on main): public share page /hp/:token
    -- (HomeProgramPage.tsx) for families with no account. Token-gated, active
    -- and unexpired only; returns NULL / raises 'not found' otherwise.
    'public.get_home_program(text)',
    'public.toggle_home_program_day(text,smallint)'
  ] LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NULL THEN
      RAISE NOTICE 'security_hardening: % not present, skipping', _sig;
      CONTINUE;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', _fn);
  END LOOP;
END
$$;


-- ===========================================================================
-- 5. Assertions. Any failure rolls back the whole migration.
-- ===========================================================================
DO $$
DECLARE
  _anon_ok text[] := ARRAY[
    'public.complete_vpc_second_confirmation(text)',
    'public.get_home_program(text)',
    'public.toggle_home_program_day(text,smallint)'
  ];
  _bad text;
  _sig text;
  _fn regprocedure;
BEGIN
  -- 5.1 No public function is anon-executable except the token allowlist.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO _bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.oid NOT IN (SELECT to_regprocedure(s) FROM unnest(_anon_ok) s
                      WHERE to_regprocedure(s) IS NOT NULL);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening: still anon-executable: %', _bad;
  END IF;

  -- 5.2 No trigger function is executable by anon or authenticated.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO _bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.prorettype = 'trigger'::regtype
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening: trigger fn still client-executable: %', _bad;
  END IF;

  -- 5.3 Token flows still reachable logged-out.
  FOREACH _sig IN ARRAY _anon_ok LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NOT NULL AND NOT (has_function_privilege('anon', _fn, 'EXECUTE')
                                AND has_function_privilege('authenticated', _fn, 'EXECUTE')) THEN
      RAISE EXCEPTION 'security_hardening: % lost its anon/authenticated grant', _sig;
    END IF;
  END LOOP;

  -- 5.4 Signed-in RPCs / RLS helpers still reachable by authenticated.
  FOREACH _sig IN ARRAY ARRAY[
    'public.can_access_child(uuid,uuid)', 'public.can_write_child(uuid,uuid)',
    'public.has_partner_access(uuid,uuid)', 'public.partner_can_write(uuid)',
    'public.can_manage_child_finance(uuid)', 'public.lookup_partner_invitation(text)',
    'public.accept_partner_invitation(text)', 'public.set_partner_access_paused(uuid,boolean)',
    'public.set_partner_role(uuid,text)', 'public.list_my_mcp_connections()',
    'public.revoke_my_mcp_connection(uuid)', 'public.delete_user_account()',
    'public.start_pro_trial()', 'public.list_accessible_children()',
    'public.get_child_profile(uuid)', 'public.get_recent_sleep(uuid,integer)',
    'public.get_recent_feeds(uuid,integer)', 'public.get_recent_diapers(uuid,integer)',
    'public.get_growth(uuid)', 'public.get_milestones(uuid,text)',
    'public.get_illnesses(uuid,boolean)', 'public.get_vaccinations(uuid,boolean)',
    'public.get_allergens(uuid)', 'public.get_summary(uuid,integer)',
    'public.toggle_sleep_todo_item(uuid,date,text)',
    'public.set_sleep_todo_wake_anchor(uuid,date,timestamptz)',
    'public.set_sleep_todo_item_time(uuid,date,text,timestamptz)'
  ] LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NOT NULL AND NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'security_hardening: % is not executable by authenticated', _sig;
    END IF;
  END LOOP;

  -- 5.5 The user-id-taking RLS helpers must stay pinned to the caller, or the
  --     authenticated grant lets any signed-in user probe other users' access.
  FOREACH _sig IN ARRAY ARRAY[
    'public.can_access_child(uuid,uuid)', 'public.can_write_child(uuid,uuid)',
    'public.has_partner_access(uuid,uuid)'
  ] LOOP
    _fn := to_regprocedure(_sig);
    IF _fn IS NOT NULL AND (SELECT prosrc FROM pg_proc WHERE oid = _fn)
                           !~ '_user_id\s*=\s*auth\.uid\(\)' THEN
      RAISE EXCEPTION 'security_hardening: % lacks the _user_id = auth.uid() guard', _sig;
    END IF;
  END LOOP;

  -- 5.6 family_moments: invoker, no anon, authenticated SELECT.
  IF to_regclass('public.family_moments') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_class
                   WHERE oid = 'public.family_moments'::regclass
                     AND 'security_invoker=true' = ANY (coalesce(reloptions, '{}'))) THEN
      RAISE EXCEPTION 'security_hardening: family_moments is not security_invoker';
    END IF;
    IF has_table_privilege('anon', 'public.family_moments', 'SELECT') THEN
      RAISE EXCEPTION 'security_hardening: anon can still SELECT family_moments';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.family_moments', 'SELECT') THEN
      RAISE EXCEPTION 'security_hardening: authenticated lost SELECT on family_moments';
    END IF;
  END IF;

  -- 5.7 Default privileges: new postgres-owned functions get no PUBLIC / anon /
  --     authenticated EXECUTE.
  IF NOT EXISTS (SELECT 1 FROM pg_default_acl
                 WHERE defaclrole = 'postgres'::regrole AND defaclnamespace = 0
                   AND defaclobjtype = 'f') THEN
    RAISE EXCEPTION 'security_hardening: no global default ACL for postgres functions (PUBLIC still gets EXECUTE)';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl a, LATERAL aclexplode(a.defaclacl) x
    WHERE a.defaclrole = 'postgres'::regrole
      AND a.defaclobjtype = 'f'
      AND a.defaclnamespace IN (0, 'public'::regnamespace)
      AND x.privilege_type = 'EXECUTE'
      AND x.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION 'security_hardening: default privileges still grant EXECUTE to PUBLIC/anon/authenticated';
  END IF;
END
$$;
