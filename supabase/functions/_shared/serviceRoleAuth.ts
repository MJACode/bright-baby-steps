// Caller check for edge functions that run with the service-role key.
//
// pg_cron sends `Authorization: Bearer <app_service_role_key>` (Vault).
// Comparing that header to SUPABASE_SERVICE_ROLE_KEY is the check. Do not
// trust a decoded JWT `role` claim: several of these functions set
// verify_jwt = false, so the platform has not checked the signature, and a
// caller can put `"role":"service_role"` in an unsigned payload.
//
// No Deno imports: vitest loads this file directly (src/test/serviceRoleAuth.test.ts).

/** Constant-time string compare. Length is mixed into the accumulator so a
 * mismatch still walks every byte of the longer input. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length, 1);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    const av = i < ab.length ? ab[i] : 0;
    const bv = i < bb.length ? bb[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

/**
 * True only when `authorization` is `Bearer <secret>` and `secret` is non-empty.
 * Fail closed on a missing header, a missing secret, or any other scheme.
 */
export function bearerMatchesSecret(authorization: string | null, secret: string): boolean {
  if (!secret || !authorization) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) return false;
  return timingSafeEqual(match[1], secret);
}
