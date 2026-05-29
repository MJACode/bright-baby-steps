// Mints a short-lived HS256 Supabase user JWT so a service-role-less, opaque
// MCP access token can be exchanged for a *user-scoped* Supabase client. With
// that client, the Stage 1 SECURITY INVOKER RPCs run as the real user and RLS
// (including has_partner_access) applies unchanged.
//
// Why HS256: the project's anon key is itself an HS256 JWT signed with the
// legacy symmetric JWT secret, so we can sign our own short-lived user JWT with
// the same secret and Supabase Auth will accept it.
//
// MANUAL PREREQUISITE — READ THIS:
//   SUPABASE_JWT_SECRET is NOT one of the secrets Supabase auto-injects into
//   edge functions (only SUPABASE_URL / SUPABASE_ANON_KEY /
//   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL are auto-injected). You MUST
//   set it manually as an edge-function secret:
//     Dashboard -> Project Settings -> API -> JWT Settings -> "JWT Secret"
//     then add it under Edge Functions -> Secrets as SUPABASE_JWT_SECRET.
//   Without it, mintUserJwt throws and every tools/call fails.
//
// Implemented with Web Crypto (crypto.subtle HMAC-SHA256) to avoid pulling a
// JWT library dependency into the Deno bundle.

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Sign a short-lived HS256 user JWT for the given Supabase user id.
 *
 * @param userId  The auth.users.id to impersonate (becomes the `sub` claim).
 * @param ttlSeconds  Token lifetime in seconds. Default 60s — long enough for a
 *                    single tools/call, short enough that a leaked token is
 *                    near-worthless.
 */
export async function mintUserJwt(
  userId: string,
  ttlSeconds = 60,
): Promise<string> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set. It is NOT auto-injected into edge " +
        "functions — set it manually (Project Settings -> API -> JWT Secret) " +
        "as an edge-function secret named SUPABASE_JWT_SECRET.",
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set.");
  }
  const iss = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss,
    iat: now,
    exp: now + ttlSeconds,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${
    base64UrlEncode(JSON.stringify(payload))
  }`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}
