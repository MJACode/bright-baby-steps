// Handler for the `request-feature` edge function ("Request early access").
//
// Lives in _shared with no Deno or remote imports so vitest can load it
// directly (src/test/requestFeature.server.test.ts). index.ts only wires in
// supabase-js, Deno.env and fetch.
//
// Contract (POST, JSON):
//   body     { feature: string }            feature must be a key of FEATURES
//   200      { ok: true, emailed: boolean } record saved; emailed=false when
//                                           Resend is unset, fails, or this
//                                           user already asked in the last 24h
//   400      { error: "unknown_feature" }   missing / invalid JSON / not allowlisted
//   401      { error: "unauthorized" }      missing or invalid user JWT
//   405      { error: "method_not_allowed" }
//   500      { error: "save_failed" }       feedback insert failed
//   500      { error: "supabase_misconfigured" }
//
// Data flow: the request is saved as a `public.feedback` row inserted with the
// CALLER's JWT (anon key + Authorization header), so the existing
// "Users can insert own feedback" policy (WITH CHECK auth.uid() = user_id) is
// the write gate. No service-role key. Then one email goes to the founder via
// Resend with the feature label, the requester's account email, user id and
// a UTC timestamp. No child data is read or sent.
//
// Logging: only the user id and vendor status codes, never the email address.

export const FEATURES: Readonly<Record<string, string>> = Object.freeze({
  "baby-signs": "Sign Language",
});

export const DEFAULT_TO_EMAIL = "Matt@graceflare.com";
export const DEFAULT_FROM_EMAIL = "Grace Flare <noreply@graceflare.com>";
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The `message` stored in public.feedback for a request. */
export function feedbackMessage(feature: string): string {
  return `[Feature request] ${feature}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type DbError = { message: string } | null;

/** The slice of a supabase-js client this handler uses. */
export interface UserClientLike {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; email?: string | null } | null } | null;
      error: unknown;
    }>;
  };
  from(table: "feedback"): {
    insert(row: { user_id: string; message: string }): PromiseLike<{ error: DbError }>;
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          gte(col: string, val: string): {
            limit(n: number): PromiseLike<{ data: unknown[] | null; error: DbError }>;
          };
        };
      };
    };
  };
}

export interface RequestFeatureDeps {
  env(name: string): string | undefined;
  /** Client authenticated as the caller (anon key + caller's Authorization). */
  createUserClient(url: string, anonKey: string, authorization: string): UserClientLike;
  fetch: typeof fetch;
  now?: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface EmailInput {
  label: string;
  feature: string;
  requesterEmail: string | null;
  userId: string;
  at: string; // ISO UTC
}

export function buildSubject(e: EmailInput): string {
  return `Early-access request: ${e.label}`;
}

export function buildText(e: EmailInput): string {
  return [
    `Early-access request: ${e.label}`,
    "",
    `Feature: ${e.label} (${e.feature})`,
    `Account email: ${e.requesterEmail ?? "(none on account)"}`,
    `User id: ${e.userId}`,
    `Requested at (UTC): ${e.at}`,
    "",
    "Saved in public.feedback.",
  ].join("\n");
}

export function buildHtml(e: EmailInput): string {
  const row = (k: string, v: string) =>
    `<p style="margin: 0 0 8px;"><strong>${k}:</strong> ${escapeHtml(v)}</p>`;
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Early-access request: ${escapeHtml(e.label)}</h1>
  <div style="background: #f6f5f1; border-radius: 12px; padding: 16px 20px; font-size: 14px; line-height: 1.6;">
    ${row("Feature", `${e.label} (${e.feature})`)}
    ${row("Account email", e.requesterEmail ?? "(none on account)")}
    ${row("User id", e.userId)}
    ${row("Requested at (UTC)", e.at)}
  </div>
  <p style="font-size: 12px; color: #888; margin-top: 24px;">Saved in public.feedback.</p>
</body></html>`;
}

export async function handleRequestFeature(req: Request, deps: RequestFeatureDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization || !/^Bearer\s+\S+/i.test(authorization)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = deps.env("SUPABASE_URL");
  const anonKey = deps.env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "supabase_misconfigured" }, 500);

  const client = deps.createUserClient(supabaseUrl, anonKey, authorization);
  let userId: string;
  let requesterEmail: string | null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) return json({ error: "unauthorized" }, 401);
    userId = data.user.id;
    requesterEmail = data.user.email ?? null;
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  let feature: unknown;
  try {
    const body = await req.json();
    feature = body && typeof body === "object" ? (body as Record<string, unknown>).feature : undefined;
  } catch {
    feature = undefined;
  }
  if (typeof feature !== "string" || !Object.prototype.hasOwnProperty.call(FEATURES, feature)) {
    return json({ error: "unknown_feature" }, 400);
  }
  const label = FEATURES[feature];
  const message = feedbackMessage(feature);
  const now = (deps.now ?? (() => new Date()))();

  // One email per user per feature per 24h. Without this, any signed-in user
  // could loop the endpoint to flood the founder's inbox and burn Resend
  // quota. RLS ("Users can view own feedback") scopes the read to the caller.
  // A lookup error fails open: the request is still saved and emailed.
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString();
  const { data: recent, error: recentErr } = await client
    .from("feedback")
    .select("id")
    .eq("user_id", userId)
    .eq("message", message)
    .gte("created_at", since)
    .limit(1);
  if (recentErr) console.error("request-feature dedupe_lookup_failed", userId);
  if (!recentErr && recent && recent.length > 0) {
    return json({ ok: true, emailed: false });
  }

  // Insert as the user; no .select() so only the INSERT policy is involved.
  const { error: insertErr } = await client.from("feedback").insert({ user_id: userId, message });
  if (insertErr) {
    console.error("request-feature save_failed", userId);
    return json({ error: "save_failed" }, 500);
  }

  const resendKey = deps.env("RESEND_API_KEY");
  if (!resendKey) {
    console.error("request-feature resend_not_configured", userId);
    return json({ ok: true, emailed: false });
  }

  const email: EmailInput = { label, feature, requesterEmail, userId, at: now.toISOString() };
  const to = deps.env("FEATURE_REQUEST_TO_EMAIL")?.trim() || DEFAULT_TO_EMAIL;
  const from = deps.env("VPC_FROM_EMAIL") || DEFAULT_FROM_EMAIL;

  let emailed = false;
  try {
    const resp = await deps.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        ...(requesterEmail ? { reply_to: requesterEmail } : {}),
        subject: buildSubject(email),
        html: buildHtml(email),
        text: buildText(email),
      }),
    });
    emailed = resp.ok;
    // Status only: Resend's error body can echo the recipient / reply-to.
    if (!resp.ok) console.error("request-feature resend_failed", resp.status, userId);
  } catch {
    console.error("request-feature resend_error", userId);
  }

  return json({ ok: true, emailed });
}
