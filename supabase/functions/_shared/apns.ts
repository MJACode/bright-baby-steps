// Apple Push Notification service (APNs) sender, token-based auth.
//
// No remote imports: WebCrypto + fetch only, so this module runs under Deno
// (edge runtime) and under vitest (src/test/apns.server.test.ts).
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   APNS_KEY     contents of the AuthKey_XXXXXXXXXX.p8 file (PKCS#8 PEM). Real
//                newlines or literal "\n" escapes both work.
//   APNS_KEY_ID  the 10-character Key ID shown next to the key in Apple
//                Developer -> Keys
//   APNS_TEAM_ID the 10-character Team ID
//   APNS_TOPIC   optional, defaults to the app's bundle id com.graceflare.app
// If any required secret is missing, sendApns returns { status: "disabled" }
// and never throws: in-app notifications keep working without push.
//
// Transport: APNs only speaks HTTP/2. Deno's fetch negotiates HTTP/2 over
// TLS via ALPN, so a plain fetch works; nothing here forces HTTP/1.1.

export type ApnsEnvironment = "production" | "sandbox";

export type ApnsConfig = {
  keyPem: string;
  keyId: string;
  teamId: string;
  topic: string;
};

export type ApnsResult =
  | { status: "sent" }
  // Token is dead for this app: delete it.
  | { status: "prune"; reason: string }
  // Transient or config error: keep the token, log, move on.
  | { status: "failed"; httpStatus: number | null; reason: string }
  | { status: "disabled" };

export type ApnsPayload = {
  aps: {
    alert: { title: string; body: string };
    sound?: string;
    "thread-id"?: string;
  };
  [custom: string]: unknown;
};

export const DEFAULT_APNS_TOPIC = "com.graceflare.app";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

// Apple accepts a provider token for up to 60 min and rejects refreshing more
// than once every 20 min (TooManyProviderTokenUpdates). 50 min sits between.
export const JWT_TTL_MS = 50 * 60 * 1000;

// 400 reasons that mean "this token will never work for this app/env".
const PRUNE_REASONS_400 = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

type EnvGetter = (key: string) => string | undefined;

function denoEnv(): EnvGetter {
  const d = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return (k) => d?.env.get(k);
}

/** Reads APNs config from env. Returns null when any required secret is missing. */
export function readApnsConfig(get: EnvGetter = denoEnv()): ApnsConfig | null {
  const keyPem = get("APNS_KEY")?.trim();
  const keyId = get("APNS_KEY_ID")?.trim();
  const teamId = get("APNS_TEAM_ID")?.trim();
  if (!keyPem || !keyId || !teamId) return null;
  return { keyPem, keyId, teamId, topic: get("APNS_TOPIC")?.trim() || DEFAULT_APNS_TOPIC };
}

// --- JWT --------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/** PKCS#8 PEM (the .p8 file) -> DER bytes. Tolerates literal "\n" escapes. */
export function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importApnsKey(pem: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * ES256 provider token: header {alg, kid}, claims {iss, iat}. WebCrypto's
 * ECDSA signature is already the raw r||s (IEEE P1363) form JWS requires.
 */
export async function buildApnsJwt(
  key: CryptoKey,
  keyId: string,
  teamId: string,
  nowMs: number,
): Promise<string> {
  const signingInput = `${base64UrlJson({ alg: "ES256", kid: keyId })}.${
    base64UrlJson({ iss: teamId, iat: Math.floor(nowMs / 1000) })
  }`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

// Module-level cache: one edge-function isolate reuses one token across ticks.
let cachedKey: { pem: string; key: CryptoKey } | null = null;
let cachedJwt: { id: string; jwt: string; issuedAtMs: number } | null = null;

/** Test hook / recovery after Apple rejects the token (403 *ProviderToken). */
export function resetApnsJwtCache(): void {
  cachedJwt = null;
}

export async function getApnsJwt(config: ApnsConfig, nowMs: number = Date.now()): Promise<string> {
  const id = `${config.teamId}:${config.keyId}`;
  if (cachedJwt && cachedJwt.id === id && nowMs - cachedJwt.issuedAtMs < JWT_TTL_MS) {
    return cachedJwt.jwt;
  }
  if (!cachedKey || cachedKey.pem !== config.keyPem) {
    cachedKey = { pem: config.keyPem, key: await importApnsKey(config.keyPem) };
  }
  const jwt = await buildApnsJwt(cachedKey.key, config.keyId, config.teamId, nowMs);
  cachedJwt = { id, jwt, issuedAtMs: nowMs };
  return jwt;
}

// --- Send -------------------------------------------------------------------

export type SendApnsOptions = {
  /** Defaults to readApnsConfig() from Deno env. Pass null to force disabled. */
  config?: ApnsConfig | null;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  /**
   * Seconds APNs keeps retrying an offline device. Reminders go stale, so
   * default to 3 h (the check-notifications cron interval); 0 = try once.
   */
  expiresInSec?: number;
};

export async function sendApns(
  token: string,
  environment: ApnsEnvironment,
  payload: ApnsPayload,
  opts: SendApnsOptions = {},
): Promise<ApnsResult> {
  const config = opts.config === undefined ? readApnsConfig() : opts.config;
  if (!config) return { status: "disabled" };
  const doFetch = opts.fetchImpl ?? fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const expiresInSec = opts.expiresInSec ?? 3 * 60 * 60;

  let jwt: string;
  try {
    jwt = await getApnsJwt(config, nowMs);
  } catch (err) {
    // Malformed APNS_KEY. Never log the key itself.
    return { status: "failed", httpStatus: null, reason: `key_error:${err instanceof Error ? err.name : "unknown"}` };
  }

  const host = HOSTS[environment] ?? HOSTS.production;
  let resp: Response;
  try {
    resp = await doFetch(`${host}/3/device/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(expiresInSec > 0 ? Math.floor(nowMs / 1000) + expiresInSec : 0),
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { status: "failed", httpStatus: null, reason: `network:${err instanceof Error ? err.name : "unknown"}` };
  }

  if (resp.status === 200) {
    await resp.body?.cancel().catch(() => {});
    return { status: "sent" };
  }

  let reason = "";
  try {
    const body = await resp.json();
    if (body && typeof body === "object" && typeof (body as { reason?: unknown }).reason === "string") {
      reason = (body as { reason: string }).reason;
    }
  } catch {
    // Non-JSON error body; status alone decides.
  }

  if (resp.status === 410) return { status: "prune", reason: reason || "Unregistered" };
  if (resp.status === 400 && PRUNE_REASONS_400.has(reason)) return { status: "prune", reason };
  if (resp.status === 403 && (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken")) {
    resetApnsJwtCache();
  }
  return { status: "failed", httpStatus: resp.status, reason: reason || "unknown" };
}
