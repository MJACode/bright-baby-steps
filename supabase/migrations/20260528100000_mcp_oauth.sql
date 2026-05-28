-- Stage 2 of the customer-facing-MCP plan: OAuth 2.1 storage for the remote
-- MCP server (`supabase/functions/mcp`).
--
-- The MCP server is an OAuth *resource server* (MCP 2025-11-25 / RFC 9728 /
-- RFC 8414 / RFC 8707). It mints opaque access tokens (NOT JWTs); the
-- access/refresh tokens, authorization codes, and any client secret are stored
-- ONLY as SHA-256 hashes — plaintext never lands in these tables.
--
-- Security model: all three tables are service-role-only. RLS is enabled with
-- NO policies for anon/authenticated, so only the service role (used by the
-- `mcp` edge function) can read/write them. This is deliberate — token hashes
-- must never be reachable by a signed-in client. The two revoke-UI RPCs at the
-- bottom are SECURITY DEFINER specifically so an `authenticated` user can see /
-- revoke *their own* connections without RLS read access to the raw tables.
--
-- Deletion path: every table FK-references auth.users(id) ON DELETE CASCADE, so
-- the final `DELETE FROM auth.users` inside `_purge_user_data(uid)` (see
-- 20260509000000_fix_purge_helper_*.sql) cleans these rows automatically. No
-- edit to _purge_user_data() / delete_user_account() is required — the cascade
-- chain covers them. (mcp_clients has no user_id and is shared DCR state, not
-- per-user data, so it is intentionally not part of a user purge.)
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS, DROP FUNCTION IF EXISTS before
-- each CREATE. A re-run is a no-op.

-- ---------------------------------------------------------------------------
-- 1. mcp_clients — RFC 7591 Dynamic Client Registration records.
--    Public PKCE clients register with token_endpoint_auth_method='none' and
--    store NO secret. A confidential client (client_secret_post) stores only
--    the SHA-256 hash of its secret.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mcp_clients (
  client_id text PRIMARY KEY,
  client_secret_hash text,
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_clients ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

COMMENT ON TABLE public.mcp_clients IS
  'RFC 7591 dynamically-registered OAuth clients for the remote MCP server. '
  'Service-role only (RLS enabled, no policies). client_secret_hash is a '
  'SHA-256 hash; public PKCE clients store none.';

-- ---------------------------------------------------------------------------
-- 2. mcp_authorization_grants — short-lived (10 min) one-time auth codes.
--    code_hash = SHA-256(code). PKCE challenge + RFC 8707 resource are bound
--    here at /oauth/approve and re-verified at /oauth/token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mcp_authorization_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text UNIQUE NOT NULL,
  client_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  scope text,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_authorization_grants ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

CREATE INDEX IF NOT EXISTS idx_mcp_authorization_grants_code_hash
  ON public.mcp_authorization_grants (code_hash);

COMMENT ON TABLE public.mcp_authorization_grants IS
  'One-time PKCE authorization codes (10 min TTL) for the MCP OAuth flow. '
  'Service-role only. code_hash is SHA-256(code); plaintext is never stored. '
  'Cascades on auth.users delete.';

-- ---------------------------------------------------------------------------
-- 3. mcp_access_tokens — opaque bearer tokens (1h TTL) + refresh tokens.
--    token_hash = SHA-256(access_token), refresh_hash = SHA-256(refresh_token).
--    resource binds the RFC 8707 audience; the /mcp endpoint rejects any token
--    whose resource != our canonical resource URL.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mcp_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text UNIQUE NOT NULL,
  refresh_hash text UNIQUE,
  client_id text NOT NULL,
  client_name text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_access_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user_id
  ON public.mcp_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_token_hash
  ON public.mcp_access_tokens (token_hash);

COMMENT ON TABLE public.mcp_access_tokens IS
  'Opaque MCP access tokens (1h TTL) + rotating refresh tokens, stored as '
  'SHA-256 hashes. resource is the RFC 8707 audience the /mcp endpoint checks. '
  'Service-role only. Cascades on auth.users delete.';

-- ---------------------------------------------------------------------------
-- Revoke-UI RPCs.
--
-- These are SECURITY DEFINER because the tables above are service-role-only
-- (RLS enabled, no authenticated policy) — a SECURITY INVOKER function run as
-- `authenticated` would see zero rows. DEFINER + an internal
-- `WHERE user_id = auth.uid()` filter is the same pattern the codebase already
-- uses in accept_partner_invitation(): the function runs with elevated rights
-- but only ever exposes / mutates the *caller's own* rows. GRANTed to
-- authenticated only (never anon).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_my_mcp_connections() CASCADE;

CREATE OR REPLACE FUNCTION public.list_my_mcp_connections()
RETURNS TABLE (
  id uuid,
  client_name text,
  created_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.client_name,
    t.created_at,
    t.last_used_at,
    t.expires_at,
    t.revoked_at
  FROM public.mcp_access_tokens t
  WHERE t.user_id = auth.uid()
  ORDER BY t.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_mcp_connections() TO authenticated;

COMMENT ON FUNCTION public.list_my_mcp_connections() IS
  'Lists the caller''s own MCP connections (safe columns only — never token '
  'hashes). SECURITY DEFINER is required because mcp_access_tokens is '
  'service-role-only; the internal WHERE user_id = auth.uid() restricts the '
  'result to the caller''s own rows.';

DROP FUNCTION IF EXISTS public.revoke_my_mcp_connection(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.revoke_my_mcp_connection(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _rows int;
BEGIN
  UPDATE public.mcp_access_tokens
  SET revoked_at = now()
  WHERE id = _id
    AND user_id = auth.uid()
    AND revoked_at IS NULL;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_my_mcp_connection(uuid) TO authenticated;

COMMENT ON FUNCTION public.revoke_my_mcp_connection(uuid) IS
  'Revokes one of the caller''s own MCP connections by id. Returns true if a '
  'row was found and revoked. SECURITY DEFINER for the same reason as '
  'list_my_mcp_connections(); the WHERE user_id = auth.uid() guard prevents '
  'revoking another user''s token.';
