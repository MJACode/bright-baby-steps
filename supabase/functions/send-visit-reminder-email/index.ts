// Sends an opt-in email reminder for an upcoming pediatric visit logged in the
// `scheduled_visits` table.
//
// Invoked by `supabase/functions/check-notifications/index.ts` for each
// `scheduled_visits` row whose 7-day or 1-day threshold has just been crossed
// AND whose `email_reminders_enabled = true`. The caller is responsible for:
//   - Looking up the parent's `auth.users.email`
//   - Stamping `reminder_7d_sent_at` / `reminder_1d_sent_at` after a 200
// This function is a thin Resend wrapper — it does NOT touch the DB, so a
// transient email-vendor failure cannot break the upstream stamp logic.
//
// Resend is the email vendor. Reuses the same secrets as send-vpc-email:
//   - RESEND_API_KEY      (required)
//   - VPC_FROM_EMAIL      (optional; defaults to noreply@graceflare.com)
//   - APP_URL             (optional; defaults to https://graceflare.com)
//
// Input JSON shape:
//   {
//     email: string,
//     child_name: string,
//     scheduled_at: string,      // ISO timestamp
//     visit_type: string,        // 'well' | 'sick' | 'specialist' | 'follow_up' | 'other'
//     doctor_name?: string,
//     location?: string,
//     days_until: number         // 7 or 1
//   }
//
// Security: caller passes the parent's JWT via Authorization. The function
// verifies the JWT and the recipient `email` matches the authenticated user.
// This prevents a compromised caller from sending arbitrary appointment
// reminders to other addresses.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VISIT_TYPE_LABELS: Record<string, string> = {
  well: "well-child",
  sick: "sick",
  specialist: "specialist",
  follow_up: "follow-up",
  other: "",
};

// Escape user-controlled strings before interpolating into the HTML body.
// Without this, a child/doctor/location name containing `<a href="...">tap me</a>`
// would render as a real clickable link in the recipient's email client.
// The plain-text body does not need escaping.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ReminderPayload {
  email: string;
  child_name: string;
  scheduled_at: string;
  visit_type: string;
  doctor_name?: string | null;
  location?: string | null;
  days_until: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatScheduled(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  // Use America/New_York as a sensible default until we add a per-user TZ
  // column. Most U.S. parents read appointment times in Eastern; users outside
  // ET will see a clearly-labeled timezone abbreviation rather than a silently
  // wrong local time.
  // P2 deferral: see `docs/legal-review-log.md` 2026-05-24 entry — per-user TZ
  // schema work is tracked there; revisit when `profiles.tz` lands.
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  });
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
}

function buildSubject(p: ReminderPayload): string {
  const label = VISIT_TYPE_LABELS[p.visit_type] ?? "";
  const visitWord = label ? `${label} visit` : "visit";
  const { date } = formatScheduled(p.scheduled_at);
  return `Reminder: ${p.child_name}'s ${visitWord} on ${date}`;
}

function buildHtml(p: ReminderPayload, recordsUrl: string): string {
  const { date, time } = formatScheduled(p.scheduled_at);
  const label = VISIT_TYPE_LABELS[p.visit_type] ?? "";
  // `visitWord` is derived from the clamped VISIT_TYPE_LABELS enum (validated
  // at the request boundary), so it is safe to interpolate raw. `date`/`time`
  // come from Intl.DateTimeFormat output, also safe. Every other interpolated
  // value below is user-controlled and goes through escapeHtml().
  const visitWord = label ? `${label} visit` : "visit";
  const window =
    p.days_until <= 1 ? "tomorrow" : `in ${p.days_until} days`;
  const childNameSafe = escapeHtml(p.child_name);
  const doctorLine = p.doctor_name
    ? `<p style="margin: 0 0 8px;"><strong>Provider:</strong> ${escapeHtml(p.doctor_name)}</p>`
    : "";
  const locationLine = p.location
    ? `<p style="margin: 0 0 8px;"><strong>Location:</strong> ${escapeHtml(p.location)}</p>`
    : "";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">${childNameSafe}'s ${visitWord} is ${window}</h1>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
    A quick heads-up so you have time to prep your questions and gather any records the provider may need.
  </p>
  <div style="background: #f6f5f1; border-radius: 12px; padding: 16px 20px; margin: 16px 0; font-size: 14px; line-height: 1.6;">
    <p style="margin: 0 0 8px;"><strong>Date:</strong> ${date}</p>
    <p style="margin: 0 0 8px;"><strong>Time:</strong> ${time}</p>
    ${doctorLine}
    ${locationLine}
  </div>
  <p style="margin: 24px 0;">
    <a href="${recordsUrl}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Open visit prep</a>
  </p>
  <p style="font-size: 13px; color: #555; line-height: 1.5;">
    You're getting this because you turned on email reminders for this visit. You can switch them off in the visit's row inside Records.
  </p>
  <p style="font-size: 12px; color: #888; margin-top: 32px;">
    Grace Flare LLC — questions: hello@graceflare.com
  </p>
</body></html>`;
}

function buildText(p: ReminderPayload, recordsUrl: string): string {
  const { date, time } = formatScheduled(p.scheduled_at);
  const label = VISIT_TYPE_LABELS[p.visit_type] ?? "";
  const visitWord = label ? `${label} visit` : "visit";
  const window = p.days_until <= 1 ? "tomorrow" : `in ${p.days_until} days`;
  const lines = [
    `${p.child_name}'s ${visitWord} is ${window}`,
    "",
    `Date: ${date}`,
    `Time: ${time}`,
  ];
  if (p.doctor_name) lines.push(`Provider: ${p.doctor_name}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  lines.push("", `Open visit prep: ${recordsUrl}`, "");
  lines.push(
    "You're getting this because you turned on email reminders for this visit. You can switch them off in the visit's row inside Records.",
  );
  lines.push("", "Grace Flare LLC — questions: hello@graceflare.com");
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "missing_authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("VPC_FROM_EMAIL") ?? "Grace Flare <noreply@graceflare.com>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://graceflare.com";

    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "supabase_misconfigured" }, 500);
    if (!resendKey) return jsonResponse({ error: "resend_misconfigured" }, 500);

    // Caller-identity gate. This function has two legitimate callers:
    //   1. `check-notifications` cron → invokes with the project's service-role
    //      JWT. The cron has already verified the row's parent_id and looked
    //      up `auth.users.email`, so we trust it to pass a valid recipient.
    //   2. (Future) a UI surface → invokes with the user's own JWT. In that
    //      path we require recipient == authenticated user's email.
    //
    // We decode the JWT once and branch on the `role` claim. Service-role
    // JWTs have `role: "service_role"`; user JWTs have `role: "authenticated"`.
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let isServiceRole = false;
    try {
      const [, payloadB64] = token.split(".");
      const claims = JSON.parse(
        atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")),
      );
      isServiceRole = claims?.role === "service_role";
    } catch {
      // fall through to user-JWT path
    }

    let payload: ReminderPayload;
    try {
      payload = (await req.json()) as ReminderPayload;
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    // Validate required fields at the boundary.
    if (
      !payload.email ||
      !payload.child_name ||
      !payload.scheduled_at ||
      !payload.visit_type ||
      typeof payload.days_until !== "number"
    ) {
      return jsonResponse({ error: "missing_required_fields" }, 400);
    }

    // Sanity: clamp visit_type to the allowed enum (defense in depth against
    // a stale caller pushing a value the DB CHECK constraint also blocks).
    if (!Object.prototype.hasOwnProperty.call(VISIT_TYPE_LABELS, payload.visit_type)) {
      return jsonResponse({ error: "invalid_visit_type" }, 400);
    }

    if (!isServiceRole) {
      // User-JWT path: recipient must match the authenticated user's email.
      const userClient = createClient(supabaseUrl, serviceKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
      const callerEmail = userData.user.email?.toLowerCase();
      if (!callerEmail || callerEmail !== payload.email.toLowerCase()) {
        return jsonResponse({ error: "email_mismatch" }, 403);
      }
    }

    const recordsUrl = `${appUrl}/dashboard/records`;
    const subject = buildSubject(payload);
    const html = buildHtml(payload, recordsUrl);
    const text = buildText(payload, recordsUrl);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.email],
        subject,
        html,
        text,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("resend_failed", resp.status, detail);
      return jsonResponse({ error: "email_send_failed" }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("send-visit-reminder-email error", message);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
