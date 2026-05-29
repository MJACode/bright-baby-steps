// Remote MCP server for Grace Flare child data.
//
// Lets a customer connect THEIR OWN Claude (Claude.ai / Claude Desktop custom
// connector / Claude Code) and read their child's data over the MCP
// 2025-11-25 Streamable HTTP transport, gated by OAuth 2.1 (PKCE S256, RFC 8707
// resource binding). This server is the OAuth *resource server* AND, for
// convenience, hosts the authorization-server endpoints (register / authorize /
// approve / token). MCP access tokens are opaque random strings stored hashed —
// they are NOT JWTs. On tools/call we mint a 60s HS256 *user* JWT to build a
// user-scoped Supabase client so the Stage 1 SECURITY INVOKER RPCs run with RLS.
//
// Reachable two ways, both routed on the path SUFFIX so either works:
//   - directly:        /functions/v1/mcp/<suffix>
//   - via Vercel:       /<suffix>  (rewritten to the above in vercel.json)
// Suffixes: /.well-known/oauth-protected-resource,
//           /.well-known/oauth-authorization-server,
//           /oauth/register, /oauth/authorize, /oauth/approve, /oauth/token,
//           /mcp
//
// Deploy with --no-verify-jwt: discovery + register + most of the OAuth flow
// are unauthenticated or use their own bearer scheme.
//
// MANUAL PREREQUISITES (see also mintUserJwt.ts):
//   - SUPABASE_JWT_SECRET edge-function secret (NOT auto-injected).
//   - APP_URL edge-function secret (already set; send-vpc-email uses it).
//
// Logging discipline: never log token values, code values, or tool result
// payloads. Method names + user_id only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dispatchChildDataTool,
  toMcpTools,
} from "../_shared/childDataTools.ts";
import { mintUserJwt } from "../_shared/mintUserJwt.ts";

// ---------------------------------------------------------------------------
// Constants / config
// ---------------------------------------------------------------------------
const PROTOCOL_VERSION = "2025-11-25";
const SERVER_NAME = "Grace Flare";
const SERVER_VERSION = "1.0.0";
const SCOPE = "child:read";
const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1h
const CODE_TTL_MS = 10 * 60 * 1000; // 10 min

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

// Canonical origin. Prefer APP_URL (already a configured edge secret); fall
// back to deriving from request headers only if it is unset.
function resolveOrigin(req: Request): string {
  const appUrl = Deno.env.get("APP_URL");
  if (appUrl) return appUrl.replace(/\/+$/, "");
  // Fallback: derive from Origin or Host.
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "https://graceflare.com";
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------
function randomToken(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

function randomClientId(): string {
  // Prefix makes them identifiable in logs/tables; suffix is random hex.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    "gf-" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")).join("");
}

// PKCE: code_challenge = base64url(SHA-256(code_verifier)).
async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlFromBytes(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function oauthError(error: string, description: string, status = 400) {
  return jsonResponse({ error, error_description: description }, status);
}

function rpcEnvelope(
  id: unknown,
  result: unknown | undefined,
  error: { code: number; message: string } | undefined,
) {
  const env: Record<string, unknown> = { jsonrpc: "2.0", id: id ?? null };
  if (error) env.error = error;
  else env.result = result;
  return env;
}

// 401 for the /mcp endpoint with the RFC 9728 resource-metadata pointer.
function unauthorizedMcp(origin: string) {
  return new Response(
    JSON.stringify(rpcEnvelope(null, undefined, {
      code: -32001,
      message: "Unauthorized",
    })),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "WWW-Authenticate":
          `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Path routing: match on the suffix after the function name so both the direct
// /functions/v1/mcp/... path and the Vercel-rewritten apex path resolve.
// ---------------------------------------------------------------------------
function routeSuffix(pathname: string): string {
  // Strip a leading /functions/v1/mcp if present (direct invocation).
  let p = pathname;
  const fnPrefix = "/functions/v1/mcp";
  if (p.startsWith(fnPrefix)) p = p.slice(fnPrefix.length);
  // Normalize trailing slash, ensure leading slash.
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

// ===========================================================================
// Handlers
// ===========================================================================

// --- Discovery: RFC 9728 protected-resource metadata ----------------------
function handleProtectedResourceMetadata(origin: string) {
  return jsonResponse({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
  });
}

// --- Discovery: RFC 8414 authorization-server metadata --------------------
function handleAuthServerMetadata(origin: string) {
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [SCOPE],
  });
}

// --- RFC 7591 Dynamic Client Registration ---------------------------------
async function handleRegister(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === "string")
  ) {
    return oauthError(
      "invalid_redirect_uri",
      "redirect_uris must be a non-empty array of URI strings.",
    );
  }
  for (const uri of redirectUris as string[]) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return oauthError("invalid_redirect_uri", `Invalid URI: ${uri}`);
    }
    const isHttpsLocalhost =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (parsed.protocol !== "https:" && !isHttpsLocalhost) {
      return oauthError(
        "invalid_redirect_uri",
        `redirect_uri must be https:// (or http://localhost): ${uri}`,
      );
    }
  }

  const authMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "none";
  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name
      : "MCP Client";
  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.length
      ? (body.grant_types as string[])
      : ["authorization_code", "refresh_token"];
  const responseTypes =
    Array.isArray(body.response_types) && body.response_types.length
      ? (body.response_types as string[])
      : ["code"];

  const clientId = randomClientId();
  // Public clients (none) store no secret. We only support public/PKCE +
  // client_secret_post on the surface; we never mint a secret in v1 (Claude
  // registers as a public PKCE client).
  const admin = adminClient();
  const { error } = await admin.from("mcp_clients").insert({
    client_id: clientId,
    client_secret_hash: null,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
  });
  if (error) {
    console.error("register: insert failed", error.message);
    return oauthError("server_error", "Could not register client.", 500);
  }

  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: grantTypes,
      response_types: responseTypes,
    },
    201,
  );
}

// --- GET /oauth/authorize -> validate + 302 to SPA consent route -----------
async function handleAuthorize(req: Request, origin: string) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const resource = q.get("resource");
  const RESOURCE = `${origin}/mcp`;

  const responseType = q.get("response_type");
  const clientId = q.get("client_id");
  const redirectUri = q.get("redirect_uri");
  const codeChallenge = q.get("code_challenge");
  const codeChallengeMethod = q.get("code_challenge_method") ?? "S256";
  const state = q.get("state") ?? "";
  const scope = q.get("scope") ?? SCOPE;

  // Validate the client + redirect_uri first so we know whether we can safely
  // redirect errors back to the client.
  if (!clientId) {
    return oauthError("invalid_request", "client_id is required.");
  }
  const admin = adminClient();
  const { data: client } = await admin
    .from("mcp_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) {
    return oauthError("invalid_client", "Unknown client_id.");
  }
  if (
    !redirectUri ||
    !Array.isArray(client.redirect_uris) ||
    !client.redirect_uris.includes(redirectUri)
  ) {
    // redirect_uri not trusted -> must NOT redirect; return a plain 400.
    return oauthError(
      "invalid_request",
      "redirect_uri does not match a registered URI for this client.",
    );
  }

  // From here errors are redirected back to the (validated) redirect_uri.
  const redirectError = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (state) u.searchParams.set("state", state);
    return Response.redirect(u.toString(), 302);
  };

  if (responseType !== "code") {
    return redirectError("unsupported_response_type", "response_type must be code.");
  }
  if (!codeChallenge) {
    return redirectError("invalid_request", "code_challenge is required (PKCE).");
  }
  if (codeChallengeMethod !== "S256") {
    return redirectError(
      "invalid_request",
      "code_challenge_method must be S256.",
    );
  }
  // RFC 8707 resource: should equal our canonical resource. Default + log if absent.
  const effectiveResource = resource ?? RESOURCE;
  if (resource && resource !== RESOURCE) {
    return redirectError(
      "invalid_target",
      "resource does not match this server's canonical resource URL.",
    );
  }
  if (!resource) {
    console.log("authorize: resource param absent; defaulting to canonical");
  }

  // Hand off to the SPA consent page (the API origin has no user session;
  // the SPA does). The consent page calls /oauth/approve with the user's JWT.
  const consent = new URL(`${origin}/settings/connect-claude/consent`);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("code_challenge", codeChallenge);
  consent.searchParams.set("code_challenge_method", codeChallengeMethod);
  if (state) consent.searchParams.set("state", state);
  consent.searchParams.set("scope", scope);
  consent.searchParams.set("resource", effectiveResource);

  return Response.redirect(consent.toString(), 302);
}

// --- POST /oauth/approve (Bearer = user's Supabase JWT) --------------------
// Confused-deputy mitigation: the authorization code is created ONLY here,
// after an explicit, authenticated, per-authorization user approval from the
// SPA consent page — never from a silently-replayed cookie/session consent.
async function handleApprove(req: Request, origin: string) {
  const RESOURCE = `${origin}/mcp`;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return oauthError("invalid_token", "Missing Authorization bearer.", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return oauthError("invalid_token", "Invalid or expired session.", 401);
  }
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_request", "Body must be JSON.");
  }

  const clientId = String(body.client_id ?? "");
  const redirectUri = String(body.redirect_uri ?? "");
  const codeChallenge = String(body.code_challenge ?? "");
  const codeChallengeMethod = String(body.code_challenge_method ?? "S256");
  const state = body.state != null ? String(body.state) : "";
  const scope = body.scope != null ? String(body.scope) : SCOPE;
  const resource = body.resource != null ? String(body.resource) : RESOURCE;

  if (!clientId || !redirectUri || !codeChallenge) {
    return oauthError(
      "invalid_request",
      "client_id, redirect_uri and code_challenge are required.",
    );
  }
  if (codeChallengeMethod !== "S256") {
    return oauthError("invalid_request", "code_challenge_method must be S256.");
  }
  if (resource !== RESOURCE) {
    return oauthError(
      "invalid_target",
      "resource must match this server's canonical resource URL.",
    );
  }

  // Re-validate client + redirect_uri.
  const admin = adminClient();
  const { data: client } = await admin
    .from("mcp_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  if (
    !client ||
    !Array.isArray(client.redirect_uris) ||
    !client.redirect_uris.includes(redirectUri)
  ) {
    return oauthError(
      "invalid_request",
      "Unknown client or redirect_uri mismatch.",
    );
  }

  const code = randomToken(32);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error: insErr } = await admin.from("mcp_authorization_grants").insert({
    code_hash: codeHash,
    client_id: clientId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    resource,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("approve: grant insert failed", insErr.message);
    return oauthError("server_error", "Could not create authorization.", 500);
  }

  console.log("approve: granted for user", userId, "client", clientId);

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return jsonResponse({ redirect: redirect.toString() });
}

// --- POST /oauth/token -----------------------------------------------------
async function handleToken(req: Request, origin: string) {
  const RESOURCE = `${origin}/mcp`;
  // Token requests are application/x-www-form-urlencoded per OAuth 2.1, but
  // accept JSON too for tolerance.
  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const j = await req.json();
      params = new URLSearchParams(
        Object.entries(j).map(([k, v]) => [k, String(v)]),
      );
    } else {
      params = new URLSearchParams(await req.text());
    }
  } catch {
    return oauthError("invalid_request", "Could not parse request body.");
  }

  const grantType = params.get("grant_type");
  const admin = adminClient();

  if (grantType === "authorization_code") {
    const code = params.get("code") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const clientId = params.get("client_id") ?? "";
    const codeVerifier = params.get("code_verifier") ?? "";
    const resource = params.get("resource") ?? "";

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return oauthError(
        "invalid_request",
        "code, redirect_uri, client_id and code_verifier are required.",
      );
    }

    const codeHash = await sha256Hex(code);
    const { data: grant } = await admin
      .from("mcp_authorization_grants")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (!grant) {
      return oauthError("invalid_grant", "Unknown authorization code.");
    }
    if (grant.consumed_at) {
      return oauthError("invalid_grant", "Authorization code already used.");
    }
    if (new Date(grant.expires_at).getTime() < Date.now()) {
      return oauthError("invalid_grant", "Authorization code expired.");
    }
    if (grant.client_id !== clientId) {
      return oauthError("invalid_grant", "client_id mismatch.");
    }
    if (grant.redirect_uri !== redirectUri) {
      return oauthError("invalid_grant", "redirect_uri mismatch.");
    }
    // RFC 8707: resource must match the grant (and our canonical resource).
    if (resource && resource !== grant.resource) {
      return oauthError("invalid_target", "resource mismatch.");
    }
    if (grant.resource !== RESOURCE) {
      return oauthError("invalid_target", "resource is not this server.");
    }

    // PKCE verification: base64url(SHA-256(verifier)) === stored challenge.
    const computed = await pkceChallengeFromVerifier(codeVerifier);
    if (computed !== grant.code_challenge) {
      return oauthError("invalid_grant", "PKCE verification failed.");
    }

    // Atomically consume the code (one-time use). The guard `consumed_at IS
    // NULL` makes this safe under concurrent /oauth/token calls: Postgres
    // serializes the row UPDATEs, so exactly one request claims the row and
    // any racing request matches zero rows. We only mint tokens if we won the
    // claim — never issue two token sets for the same code.
    const { data: claimed, error: claimErr } = await admin
      .from("mcp_authorization_grants")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", grant.id)
      .is("consumed_at", null)
      .select("id");
    if (claimErr) {
      console.error("token: code consume failed", claimErr.message);
      return oauthError("server_error", "Could not consume authorization code.", 500);
    }
    if (!claimed || claimed.length === 0) {
      return oauthError("invalid_grant", "Authorization code already used.");
    }

    // Copy client_name for the revoke UI.
    const { data: client } = await admin
      .from("mcp_clients")
      .select("client_name")
      .eq("client_id", clientId)
      .maybeSingle();

    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    const tokenHash = await sha256Hex(accessToken);
    const refreshHash = await sha256Hex(refreshToken);
    const expiresAt = new Date(
      Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    ).toISOString();

    const { error: tokErr } = await admin.from("mcp_access_tokens").insert({
      token_hash: tokenHash,
      refresh_hash: refreshHash,
      client_id: clientId,
      client_name: client?.client_name ?? null,
      user_id: grant.user_id,
      scope: grant.scope ?? SCOPE,
      resource: grant.resource,
      expires_at: expiresAt,
    });
    if (tokErr) {
      console.error("token: access token insert failed", tokErr.message);
      return oauthError("server_error", "Could not issue token.", 500);
    }

    return jsonResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scope ?? SCOPE,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") ?? "";
    const clientId = params.get("client_id") ?? "";
    if (!refreshToken) {
      return oauthError("invalid_request", "refresh_token is required.");
    }
    const refreshHash = await sha256Hex(refreshToken);
    const { data: row } = await admin
      .from("mcp_access_tokens")
      .select("*")
      .eq("refresh_hash", refreshHash)
      .maybeSingle();

    if (!row) {
      return oauthError("invalid_grant", "Unknown refresh token.");
    }
    if (row.revoked_at) {
      return oauthError("invalid_grant", "Token has been revoked.");
    }
    if (clientId && row.client_id !== clientId) {
      return oauthError("invalid_grant", "client_id mismatch.");
    }

    // Rotate: issue a new access + refresh, update the existing row in place.
    const newAccess = randomToken(32);
    const newRefresh = randomToken(32);
    const newTokenHash = await sha256Hex(newAccess);
    const newRefreshHash = await sha256Hex(newRefresh);
    const expiresAt = new Date(
      Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    ).toISOString();

    const { error: updErr } = await admin
      .from("mcp_access_tokens")
      .update({
        token_hash: newTokenHash,
        refresh_hash: newRefreshHash,
        expires_at: expiresAt,
      })
      .eq("id", row.id);
    if (updErr) {
      console.error("token: refresh rotation failed", updErr.message);
      return oauthError("server_error", "Could not rotate token.", 500);
    }

    return jsonResponse({
      access_token: newAccess,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefresh,
      scope: row.scope ?? SCOPE,
    });
  }

  return oauthError("unsupported_grant_type", "Unsupported grant_type.");
}

// --- POST /mcp (Streamable HTTP JSON-RPC) ----------------------------------
interface ResolvedToken {
  user_id: string;
  id: string;
}

// Mcp-Session-Id is an opaque HMAC of user_id + nonce so we can both bind it to
// a user and verify it without server-side session storage.
async function makeSessionId(userId: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "mcp-session-fallback";
  const nonce = randomToken(8);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${userId}.${nonce}`),
  );
  return `${nonce}.${base64UrlFromBytes(new Uint8Array(sig))}`;
}

async function handleMcpPost(req: Request, origin: string): Promise<Response> {
  const RESOURCE = `${origin}/mcp`;

  // Bearer auth.
  const authHeader = req.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return unauthorizedMcp(origin);
  const bearer = m[1].trim();

  const admin = adminClient();
  const tokenHash = await sha256Hex(bearer);
  const { data: tokenRow } = await admin
    .from("mcp_access_tokens")
    .select("id, user_id, resource, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    !tokenRow ||
    tokenRow.revoked_at ||
    new Date(tokenRow.expires_at).getTime() < Date.now() ||
    tokenRow.resource !== RESOURCE // RFC 8707 audience check
  ) {
    return unauthorizedMcp(origin);
  }

  const resolved: ResolvedToken = {
    user_id: tokenRow.user_id,
    id: tokenRow.id,
  };

  // Stamp last_used_at (best effort; don't block the response on it).
  admin
    .from("mcp_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", resolved.id)
    .then(() => {}, () => {});

  // Parse JSON-RPC. Arrays (batch) rejected with a clear error in v1.
  let rpc: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (Array.isArray(parsed)) {
      return jsonResponse(
        rpcEnvelope(null, undefined, {
          code: -32600,
          message: "Batch requests are not supported.",
        }),
      );
    }
    rpc = parsed;
  } catch {
    return jsonResponse(
      rpcEnvelope(null, undefined, {
        code: -32700,
        message: "Parse error.",
      }),
    );
  }

  const method = typeof rpc.method === "string" ? rpc.method : "";
  const id = rpc.id;
  const params = (rpc.params ?? {}) as Record<string, unknown>;
  const isNotification = id === undefined; // JSON-RPC notification has no id.

  console.log("mcp:", method, "user", resolved.user_id);

  // notifications/initialized -> 202 no body.
  if (method === "notifications/initialized" || isNotification) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  // initialize -> issue a session id bound to the user.
  if (method === "initialize") {
    const sessionId = await makeSessionId(resolved.user_id);
    return jsonResponse(
      rpcEnvelope(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      }, undefined),
      200,
      { "Mcp-Session-Id": sessionId },
    );
  }

  // Non-initialize methods require the session id once it has been issued.
  const sessionHeader = req.headers.get("mcp-session-id");
  if (!sessionHeader) {
    return jsonResponse(
      rpcEnvelope(id, undefined, {
        code: -32600,
        message: "Missing Mcp-Session-Id header.",
      }),
    );
  }

  if (method === "tools/list") {
    return jsonResponse(
      rpcEnvelope(id, { tools: toMcpTools() }, undefined),
    );
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    if (!name) {
      return jsonResponse(
        rpcEnvelope(id, undefined, {
          code: -32602,
          message: "tools/call requires a tool name.",
        }),
      );
    }

    let jwt: string;
    try {
      jwt = await mintUserJwt(resolved.user_id, 60);
    } catch (err) {
      console.error("tools/call: mintUserJwt failed", (err as Error).message);
      return jsonResponse(
        rpcEnvelope(id, undefined, {
          code: -32603,
          message: "Server auth misconfiguration.",
        }),
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userSb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const r = await dispatchChildDataTool(userSb, name, args);
    return jsonResponse(
      rpcEnvelope(id, {
        content: [{ type: "text", text: r.content }],
        isError: !!r.is_error,
      }, undefined),
    );
  }

  // Unknown method.
  return jsonResponse(
    rpcEnvelope(id, undefined, {
      code: -32601,
      message: `Method not found: ${method}`,
    }),
  );
}

// ===========================================================================
// Router
// ===========================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const origin = resolveOrigin(req);
  const suffix = routeSuffix(new URL(req.url).pathname);

  try {
    // Discovery (GET).
    if (
      suffix === "/.well-known/oauth-protected-resource" &&
      req.method === "GET"
    ) {
      return handleProtectedResourceMetadata(origin);
    }
    if (
      suffix === "/.well-known/oauth-authorization-server" &&
      req.method === "GET"
    ) {
      return handleAuthServerMetadata(origin);
    }

    // OAuth endpoints.
    if (suffix === "/oauth/register" && req.method === "POST") {
      return await handleRegister(req);
    }
    if (suffix === "/oauth/authorize" && req.method === "GET") {
      return await handleAuthorize(req, origin);
    }
    if (suffix === "/oauth/approve" && req.method === "POST") {
      return await handleApprove(req, origin);
    }
    if (suffix === "/oauth/token" && req.method === "POST") {
      return await handleToken(req, origin);
    }

    // MCP Streamable HTTP endpoint.
    if (suffix === "/mcp") {
      if (req.method === "POST") return await handleMcpPost(req, origin);
      if (req.method === "DELETE") {
        // Best-effort session termination. We hold no server-side session state
        // (the session id is a stateless HMAC), so just acknowledge.
        return new Response(null, { status: 200, headers: corsHeaders });
      }
      if (req.method === "GET") {
        // No server-initiated SSE in v1 (spec-allowed for tool-only servers).
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders,
        });
      }
    }

    return jsonResponse({ error: "not_found" }, 404);
  } catch (err) {
    console.error("mcp router error", (err as Error).message);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
