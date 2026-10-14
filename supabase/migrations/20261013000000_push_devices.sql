-- Server push (APNs): one row per app install that can receive pushes.
--
-- Plan: tasks/todo-push-and-allergen-rhythm.md, PR A. Written by
-- check-notifications (service role) only to PRUNE dead tokens; every other
-- write comes from the signed-in app through the two RPCs below.
--
-- Token ownership ("device changed hands"):
--   An APNs token identifies one app install on one device, so it is UNIQUE
--   here. The app calls register_push_device on every launch / resume. If the
--   token is already on another account's row (that person signed out without
--   unregistering, or a second family member signed in on the same phone), the
--   row MOVES to the caller: only whoever is signed in on the device right now
--   should get its pushes. A plain INSERT under RLS cannot do that (the caller
--   cannot see, and must not be able to see, the other account's row), hence
--   SECURITY DEFINER. The only thing a caller can do to another account through
--   this path is take over a token it already holds, i.e. a token issued to
--   the app on a device it has in hand. Tokens are never readable across
--   accounts (owner-only SELECT), so they cannot be harvested.
--
-- Account deletion: user_id REFERENCES auth.users ON DELETE CASCADE.
--   _purge_user_data(_uid) (live definition checked 2026-10-13, read-only) ends
--   with `DELETE FROM auth.users WHERE id = _uid`, which cascades here, and
--   delete_user_account() / purge_inactive_account() both go through it. Per
--   lessons-backend 2026-05-24 the purge helper is NOT redefined here.
--
-- Privileges (20261009000000 / 20261008020000 conventions): new tables give
--   anon nothing and authenticated S/I/U/D; new functions give EXECUTE to
--   nobody, so the RPCs are granted to authenticated explicitly. No logged-out
--   page touches this table, so there is no anon grant.
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token        text NOT NULL,
  platform     text NOT NULL DEFAULT 'ios',
  environment  text NOT NULL DEFAULT 'production',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_token_key UNIQUE (token),
  CONSTRAINT push_devices_platform_check CHECK (platform IN ('ios')),
  CONSTRAINT push_devices_environment_check CHECK (environment IN ('production', 'sandbox')),
  -- APNs tokens are 32 bytes (64 hex chars) today; Apple says not to rely on
  -- the length, so allow up to 200. Lower-cased by register_push_device.
  CONSTRAINT push_devices_token_format_check CHECK (token ~ '^[0-9a-f]{64,200}$')
);

COMMENT ON TABLE public.push_devices IS
  'APNs device tokens per signed-in user. Written via register_push_device / unregister_push_device; check-notifications reads it (service role) and prunes tokens APNs reports as dead. Cascades from auth.users on account deletion.';

-- Fan-out lookup in check-notifications (.in("user_id", ...)) and the FK
-- cascade on account deletion.
CREATE INDEX IF NOT EXISTS push_devices_user_id_idx ON public.push_devices (user_id);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four commands. UPDATE carries an explicit WITH CHECK so a
-- row can never be re-pointed at another user through PostgREST.
DROP POLICY IF EXISTS push_devices_select ON public.push_devices;
CREATE POLICY push_devices_select ON public.push_devices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_devices_insert ON public.push_devices;
CREATE POLICY push_devices_insert ON public.push_devices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_devices_update ON public.push_devices;
CREATE POLICY push_devices_update ON public.push_devices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_devices_delete ON public.push_devices;
CREATE POLICY push_devices_delete ON public.push_devices
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Belt and braces on top of the 20261009 default ACL: anon gets nothing,
-- authenticated gets plain DML only (no TRUNCATE / REFERENCES / TRIGGER /
-- MAINTAIN).
REVOKE ALL ON TABLE public.push_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_devices TO authenticated;
GRANT ALL ON TABLE public.push_devices TO service_role;

-- ---------------------------------------------------------------------------
-- register_push_device: upsert on token, (re)assign to the caller, refresh
-- last_seen_at. Called on every launch / resume, so it is also the liveness
-- signal. Keeps at most 10 installs per account (oldest last_seen_at dropped)
-- so a reinstall loop can't make one account's fan-out unbounded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_device(p_token text, p_environment text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid   uuid := auth.uid();
  _token text := lower(btrim(coalesce(p_token, '')));
  _env   text := coalesce(nullif(btrim(p_environment), ''), 'production');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _token !~ '^[0-9a-f]{64,200}$' THEN
    RAISE EXCEPTION 'Invalid push token' USING ERRCODE = '22023';
  END IF;
  IF _env NOT IN ('production', 'sandbox') THEN
    RAISE EXCEPTION 'Invalid push environment' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_devices AS d (user_id, token, platform, environment, last_seen_at)
  VALUES (_uid, _token, 'ios', _env, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id      = excluded.user_id,
        environment  = excluded.environment,
        last_seen_at = now(),
        -- A different account taking the token over is a new registration.
        created_at   = CASE WHEN d.user_id = excluded.user_id THEN d.created_at ELSE now() END;

  DELETE FROM public.push_devices
  WHERE user_id = _uid
    AND id IN (
      SELECT id FROM public.push_devices
      WHERE user_id = _uid
      ORDER BY last_seen_at DESC, created_at DESC
      OFFSET 10
    );
END;
$$;

-- unregister_push_device: called on sign-out. Only removes the caller's own
-- row; a token that already moved to someone else is left alone.
CREATE OR REPLACE FUNCTION public.unregister_push_device(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.push_devices
  WHERE token = lower(btrim(coalesce(p_token, '')))
    AND user_id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_push_device(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unregister_push_device(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Hard assertions: fail (and roll back) instead of reporting success.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _n int;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_devices'::regclass) THEN
    RAISE EXCEPTION 'push_devices: RLS not enabled';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'push_devices';
  IF _n <> 4 THEN
    RAISE EXCEPTION 'push_devices: expected 4 policies, found %', _n;
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'push_devices' AND cmd = 'ALL';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'push_devices: unexpected FOR ALL policy';
  END IF;

  IF has_table_privilege('anon', 'public.push_devices', 'SELECT')
     OR has_table_privilege('anon', 'public.push_devices', 'INSERT')
     OR has_table_privilege('anon', 'public.push_devices', 'UPDATE')
     OR has_table_privilege('anon', 'public.push_devices', 'DELETE')
     OR has_table_privilege('authenticated', 'public.push_devices', 'TRUNCATE') THEN
    RAISE EXCEPTION 'push_devices: anon or TRUNCATE privilege present';
  END IF;

  IF has_function_privilege('anon', 'public.register_push_device(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.unregister_push_device(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'push_devices: RPC executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.register_push_device(text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.unregister_push_device(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'push_devices: RPC not executable by authenticated';
  END IF;

  -- Account deletion relies on this cascade (see header).
  SELECT count(*) INTO _n FROM pg_constraint
  WHERE conrelid = 'public.push_devices'::regclass
    AND contype = 'f'
    AND confrelid = 'auth.users'::regclass
    AND confdeltype = 'c';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'push_devices: missing ON DELETE CASCADE to auth.users';
  END IF;
END;
$$;
