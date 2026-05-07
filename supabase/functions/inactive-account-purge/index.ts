// Inactive-account auto-purge per Privacy § 8 + COPPA § 312.10.
//
// Run daily by pg_cron (see 20260507040000_inactive_account_purge.sql).
//
// Two stages:
//   Stage 1 — 24 months of no sign-in, never warned:
//     * Send a 30-day warning email via Resend.
//     * Stamp profiles.inactive_purge_warned_at = now().
//   Stage 2 — warned > 30 days ago AND still no sign-in since the warning:
//     * Call the SECURITY DEFINER RPC purge_inactive_account(uid).
//
// We also un-warn anyone whose last_sign_in_at is now newer than the warning
// timestamp — they came back, so the purge should be cancelled.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set by Supabase by default)
//   RESEND_API_KEY, VPC_FROM_EMAIL (configured for send-vpc-email — reused),
//   APP_URL (the deployed frontend origin).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const INACTIVE_THRESHOLD_DAYS = 730; // 24 months
const WARNING_GRACE_DAYS = 30;
const BATCH_LIMIT = 200;

interface ProfileWithEmail {
  id: string;
  email: string | null;
  inactive_purge_warned_at: string | null;
  last_sign_in_at: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function warningEmailHtml(appUrl: string, deletionDate: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Your Grace Flare account will be deleted in 30 days</h1>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
    You haven't signed in to Grace Flare in over 24 months. Per our Privacy
    Policy, we delete inactive accounts to keep our data minimal.
  </p>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
    <strong>Your account and all child records will be permanently deleted on ${deletionDate}.</strong>
  </p>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
    To keep your account, just sign in any time before that date. No further
    action is needed.
  </p>
  <p style="margin: 24px 0;">
    <a href="${appUrl}/auth" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Sign in to keep my account</a>
  </p>
  <p style="font-size: 13px; color: #555; line-height: 1.5;">
    Want to delete now or export your data first? Use the
    <a href="${appUrl}/rights-request" style="color: #2563eb;">privacy request form</a>.
  </p>
  <p style="font-size: 12px; color: #888; margin-top: 32px;">
    Grace Flare LLC — privacy questions: privacy@graceflare.com
  </p>
</body></html>`;
}

function warningEmailText(appUrl: string, deletionDate: string): string {
  return [
    "Your Grace Flare account will be deleted in 30 days.",
    "",
    `You haven't signed in to Grace Flare in over 24 months. Per our Privacy Policy, we delete inactive accounts to keep our data minimal. Your account and all child records will be permanently deleted on ${deletionDate}.`,
    "",
    "To keep your account, just sign in any time before that date. No further action is needed.",
    "",
    `Sign in: ${appUrl}/auth`,
    `Submit a privacy request first: ${appUrl}/rights-request`,
    "",
    "Grace Flare LLC — privacy questions: privacy@graceflare.com",
  ].join("\n");
}

async function sendWarningEmail(args: {
  resendKey: string;
  fromEmail: string;
  toEmail: string;
  appUrl: string;
}): Promise<boolean> {
  const deletionDate = new Date(Date.now() + WARNING_GRACE_DAYS * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.fromEmail,
      to: [args.toEmail],
      subject: "Your Grace Flare account will be deleted in 30 days",
      html: warningEmailHtml(args.appUrl, deletionDate),
      text: warningEmailText(args.appUrl, deletionDate),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.error("inactive-warning email failed", resp.status, detail);
    return false;
  }
  return true;
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("VPC_FROM_EMAIL") ?? "Grace Flare <noreply@graceflare.com>";
    const appUrl = Deno.env.get("APP_URL") ?? "https://graceflare.com";

    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "supabase_misconfigured" }, 500);
    if (!resendKey) return jsonResponse({ error: "resend_misconfigured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);

    const inactiveCutoffIso = new Date(
      Date.now() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const purgeCutoffIso = new Date(
      Date.now() - WARNING_GRACE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // ── Pull candidate users ─────────────────────────────────────────
    // We need both auth.users (for last_sign_in_at + email) and profiles
    // (for inactive_purge_warned_at). The cleanest path is the admin Auth
    // API for the listing; profile reads are batched.
    const { data: usersResp, error: usersErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: BATCH_LIMIT,
    });
    if (usersErr) return jsonResponse({ error: "list_users_failed", detail: usersErr.message }, 500);

    const candidates: ProfileWithEmail[] = [];
    for (const u of usersResp.users) {
      const lastSignIn = u.last_sign_in_at ?? u.created_at;
      if (!lastSignIn) continue;
      if (lastSignIn > inactiveCutoffIso) continue;
      candidates.push({
        id: u.id,
        email: u.email ?? null,
        last_sign_in_at: lastSignIn,
        inactive_purge_warned_at: null, // filled below
      });
    }

    if (candidates.length === 0) {
      return jsonResponse({ ok: true, warned: 0, purged: 0, cancelled: 0, examined: usersResp.users.length });
    }

    // Fetch warning timestamps for the candidate uids
    const { data: profileRows, error: profErr } = await admin
      .from("profiles")
      .select("id, inactive_purge_warned_at")
      .in("id", candidates.map((c) => c.id));

    if (profErr) return jsonResponse({ error: "profile_read_failed", detail: profErr.message }, 500);

    const warnedAtById = new Map<string, string | null>();
    for (const row of profileRows ?? []) {
      const r = row as { id: string; inactive_purge_warned_at: string | null };
      warnedAtById.set(r.id, r.inactive_purge_warned_at);
    }

    let warnedCount = 0;
    let purgedCount = 0;
    let cancelledCount = 0;

    for (const c of candidates) {
      const warnedAt = warnedAtById.get(c.id) ?? null;
      const lastSignIn = c.last_sign_in_at!;

      // Cancel a pending purge if the user has signed in since the warning
      if (warnedAt && lastSignIn > warnedAt) {
        await admin
          .from("profiles")
          .update({ inactive_purge_warned_at: null })
          .eq("id", c.id);
        cancelledCount++;
        continue;
      }

      // Stage 2 — purge eligible
      if (warnedAt && warnedAt < purgeCutoffIso) {
        const { error: purgeErr } = await admin.rpc("purge_inactive_account", {
          _target_uid: c.id,
        });
        if (purgeErr) {
          console.error("purge_inactive_account failed", c.id, purgeErr.message);
          continue;
        }
        purgedCount++;
        continue;
      }

      // Stage 1 — send warning, stamp warned_at
      if (!warnedAt && c.email) {
        const sent = await sendWarningEmail({
          resendKey,
          fromEmail,
          toEmail: c.email,
          appUrl,
        });
        if (!sent) continue;

        const { error: updateErr } = await admin
          .from("profiles")
          .update({ inactive_purge_warned_at: new Date().toISOString() })
          .eq("id", c.id);
        if (updateErr) {
          console.error("warned_at update failed", c.id, updateErr.message);
          continue;
        }
        warnedCount++;
      }
    }

    return jsonResponse({
      ok: true,
      examined: usersResp.users.length,
      candidates: candidates.length,
      warned: warnedCount,
      purged: purgedCount,
      cancelled: cancelledCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("inactive-account-purge error", message);
    return jsonResponse({ error: "internal_error", detail: message }, 500);
  }
});
