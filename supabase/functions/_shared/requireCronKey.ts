// Caller check for edge functions that only pg_cron may invoke
// (check-notifications, reactivate-nudge, inactive-account-purge).
//
// The cron jobs send the Supabase secret API key named `cron`
// (sb_secret_...) on the `apikey` header, read from Vault. New-style secret
// keys are NOT JWTs: they must not go on `Authorization: Bearer`, and the
// platform's verify_jwt gate cannot validate them, so these functions run with
// verify_jwt = false (supabase/config.toml) and authorize here instead.
//
// Verification uses the documented primitive from @supabase/server
// (`verifyAuth` with `auth: 'secret:cron'`, see
// https://supabase.com/docs/guides/functions/auth). It reads the named key
// from the SUPABASE_SECRET_KEYS env (a JSON object keyed by key name, injected
// by the platform) and compares in constant time (double HMAC).
//
// Fail closed:
//   - no / wrong apikey                         -> 401
//   - SUPABASE_SECRET_KEYS unset, unparseable,
//     or has no `cron` entry                    -> 500 (misconfiguration)
//   - anything throws                           -> 500
// Only `{ error: { code, message } }` is returned; key names and hints stay in
// the function log.
//
// Usage, first thing in the handler (after an OPTIONS short-circuit if any):
//   const denied = await requireCronKey(req);
//   if (denied) return denied;

import { verifyAuth } from "npm:@supabase/server@1.9.0/core";

export const CRON_KEY_NAME = "cron";

function deny(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Returns null when the request carries the `cron` secret key on the `apikey`
 * header, otherwise a ready-to-return 401/500 Response.
 */
export async function requireCronKey(req: Request): Promise<Response | null> {
  try {
    const { data, error } = await verifyAuth(req, { auth: `secret:${CRON_KEY_NAME}` });
    if (error || !data || data.authMode !== "secret" || data.keyName !== CRON_KEY_NAME) {
      const status = error?.status === 500 ? 500 : 401;
      // Codes only; never log header values.
      console.error("requireCronKey denied", status, error?.code ?? "no_match");
      return status === 500
        ? deny(500, "cron_auth_misconfigured", "Cron key is not configured for this function.")
        : deny(401, "unauthorized", "Missing or invalid cron key.");
    }
    return null;
  } catch (err) {
    console.error("requireCronKey error", err instanceof Error ? err.name : "unknown_error");
    return deny(500, "cron_auth_error", "Cron key check failed.");
  }
}
