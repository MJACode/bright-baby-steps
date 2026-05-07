// Sends the second (delayed-confirmation) email for COPPA Verifiable Parental
// Consent under the email-plus methodology (16 CFR § 312.5(b)(2)(ii)).
//
// Flow:
//   1. Client (the Add Child gate) calls this function with the user's JWT.
//   2. We verify the user, look up their profile, and require:
//        - vpc_first_confirmation_at IS NOT NULL
//        - 24 hours has elapsed since vpc_first_confirmation_at
//        - vpc_completed_at IS NULL
//   3. We mint a token, write it to profiles.vpc_second_token + expiry,
//      and email a link to {APP_URL}/vpc-confirm?token=...
//   4. The user clicks the link. The /vpc-confirm route calls the
//      complete_vpc_second_confirmation() RPC, which validates the token and
//      stamps vpc_completed_at — unlocking child INSERTs.
//
// Resend is the email vendor. Set RESEND_API_KEY and VPC_FROM_EMAIL secrets
// on the Supabase project. APP_URL must point at the deployed frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_TTL_HOURS = 72;
const MIN_DELAY_HOURS = 24;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function emailHtml(confirmUrl: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Confirm parental consent</h1>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">
    You signed up for Grace Flare and confirmed your email address yesterday.
    Before you can add a child profile, U.S. children's-privacy law (COPPA) asks
    us to confirm a second time that you are the parent or legal guardian.
  </p>
  <p style="margin: 24px 0;">
    <a href="${confirmUrl}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Confirm parental consent</a>
  </p>
  <p style="font-size: 13px; color: #555; line-height: 1.5;">
    This link expires in ${TOKEN_TTL_HOURS} hours. If you didn't sign up for
    Grace Flare or didn't request this, ignore this email and we'll delete
    the pending account after 30 days.
  </p>
  <p style="font-size: 12px; color: #888; margin-top: 32px;">
    Grace Flare LLC — children's-privacy questions: coppa@graceflare.com
  </p>
</body></html>`;
}

function emailText(confirmUrl: string): string {
  return [
    "Confirm parental consent",
    "",
    "You signed up for Grace Flare and confirmed your email yesterday. Before you can add a child profile, U.S. children's-privacy law (COPPA) asks us to confirm a second time that you are the parent or legal guardian.",
    "",
    `Confirm here: ${confirmUrl}`,
    "",
    `This link expires in ${TOKEN_TTL_HOURS} hours. If you didn't sign up for Grace Flare or didn't request this, ignore this email and we'll delete the pending account after 30 days.`,
    "",
    "Grace Flare LLC — children's-privacy questions: coppa@graceflare.com",
  ].join("\n");
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

    // Verify the caller's identity using the user's JWT against a user-scoped client.
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
    const userId = userData.user.id;
    const email = userData.user.email;
    if (!email) return jsonResponse({ error: "no_email_on_account" }, 400);

    // Service-role client for profile reads/writes.
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("vpc_first_confirmation_at, vpc_completed_at")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) return jsonResponse({ error: "profile_not_found" }, 404);

    if (profile.vpc_completed_at) {
      return jsonResponse({ ok: true, already_completed: true });
    }
    if (!profile.vpc_first_confirmation_at) {
      return jsonResponse({ error: "first_confirmation_required" }, 409);
    }

    const firstAt = new Date(profile.vpc_first_confirmation_at).getTime();
    const elapsedMs = Date.now() - firstAt;
    const requiredMs = MIN_DELAY_HOURS * 60 * 60 * 1000;
    if (elapsedMs < requiredMs) {
      const waitUntil = new Date(firstAt + requiredMs).toISOString();
      return jsonResponse({ error: "too_soon", wait_until: waitUntil }, 409);
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        vpc_second_token: token,
        vpc_second_token_expires_at: expiresAt,
      })
      .eq("id", userId);

    if (updateErr) return jsonResponse({ error: "token_persist_failed" }, 500);

    const confirmUrl = `${appUrl}/vpc-confirm?token=${encodeURIComponent(token)}`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Confirm parental consent for Grace Flare",
        html: emailHtml(confirmUrl),
        text: emailText(confirmUrl),
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("resend_failed", resp.status, detail);
      return jsonResponse({ error: "email_send_failed" }, 502);
    }

    return jsonResponse({ ok: true, expires_at: expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("send-vpc-email error", message);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
