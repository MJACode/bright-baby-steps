// "Weekly sign plan" (Baby Signs coach) — builds a one-week sign plan for a
// child from the curated Baby Signs library.
//
// Flare+ feature. Wraps the `slp` persona (single source of truth in
// ../_shared/personas.ts) with SIGN_PLAN_INSTRUCTION and returns a sanitized
// SignPlan. Contract: specs/001-baby-signs-v2/contracts/generate-sign-plan.md.
//
// Non-streaming (called via supabase.functions.invoke), like
// generate-activity-plan and generate-speech-class. Differences from those:
//   * Data minimization (FR-021, research R7): the request is allowlisted to
//     childId, weekStart, correctedAgeMonths and per-sign
//     { slug, status, isFocus, focusDays, practiceDays4w }. Every other body
//     field (name, DOB, interests, free text) is ignored and never read.
//   * One plan per child per week (FR-020) is enforced HERE, before the paid
//     Anthropic call.
//   * The server persists the plan itself, upserting sign_plans on child_id
//     with the caller's JWT (NOT the service-role key), so the table's RLS is
//     the write gate. parent_id is the child OWNER, resolved from children.
//   * Model output is sanitized: unknown slugs, extra fields, over-length or
//     off-tone strings are dropped; 0 usable focus signs -> 422. The pure
//     validation / sanitizer / stall helpers live in ../_shared/signPlan.ts
//     so vitest can lock them against the client (Principle V).
//
// The request body is never logged. On a parse failure only a truncated model
// output is logged.
//
// Uses the same Anthropic pattern as generate-activity-plan —
// ANTHROPIC_API_KEY env var, model in SIGN_PLAN_MODEL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";
import {
  buildUserText,
  isStalled,
  planExistsForWeek,
  sanitizePlan,
  validateInput,
} from "../_shared/signPlan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Same model as generate-activity-plan / generate-speech-class. Bump here.
const SIGN_PLAN_MODEL = "claude-sonnet-4-6";
const SIGN_PLAN_MAX_TOKENS = 1500;

const MAX_BODY_BYTES = 16 * 1024;

// Appended to the slp persona prompt. Mirrors the contract's prompt rules.
const SIGN_PLAN_INSTRUCTION = `You are now building this week's Baby Signs plan: a short, warm plan that helps one tired parent model a few ASL-based signs with their baby during everyday routines. You are given only the child's corrected age in months and their progress on a curated library of signs. You do not know the child's name, and you never need it — say "your baby".

Return ONLY this JSON object — no prose, no code fences:
{
  "intro": "one or two warm sentences, at most 240 characters, that celebrate the effort so far",
  "focus": [
    {
      "slug": "<a slug from the library list>",
      "why": "one line, at most 140 characters, on why this sign fits this week",
      "moments": ["an everyday routine moment to use it, at most 120 characters", "optional second moment"]
    }
  ],
  "stuck": [
    { "slug": "<a slug marked STALLED>", "tryThis": "a fresh, gentle approach, at most 200 characters" }
  ]
}

Rules:
- focus: 2 to 3 signs, with 1 or 2 moments each. stuck: 0 to 3 items.
- Recommend only slugs from the provided library list, spelled exactly as given. Never invent a sign.
- Always remind the parent to say the word out loud while signing.
- Celebrate effort. Never diagnose. Never mention delays, red flags, being "behind", or what a baby "should" do. Never mention days without practice, missed days, or streaks. Never mention worry, concern, evaluations, or therapists, and never call a baby a "late talker" or "late signer".
- Never suggest withholding food, drink, toys, or comfort to get a sign. Model the sign and give the item anyway.
- Moments must be everyday routines: meals, bath, diaper change, play, reading.
- Prefer keeping signs at "emerging" in focus. Move past signs already at "signing" — choose new library signs instead.
- Add a stuck item only for signs marked STALLED in the input, and never for any other sign.
- Keep every string within its character limit. Plain, friendly language for a parent, not a clinician.`;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Authenticate.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // User-JWT client: every query and the final upsert run under RLS.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });

    // 2. Flare+ gate (same lookup as generate-activity-plan, FR-026).
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();
    const isPremium =
      sub?.tier === "plus" && (sub?.status === "active" || sub?.status === "trialing");
    if (!isPremium) return json(403, { error: "premium_required", upgradeUrl: "/upgrade" });

    // 3. Validate. The body is read as text so it can be size-capped; it is
    // never logged.
    const bodyText = await req.text();
    if (bodyText.length > MAX_BODY_BYTES) return json(400, { error: "invalid_input" });
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return json(400, { error: "invalid_input" });
    }
    const input = validateInput(body, Date.now());
    if (!input) return json(400, { error: "invalid_input" });

    // 4. Access + weekly limit, under the caller's RLS.
    const [childRes, planRes] = await Promise.all([
      supabase.from("children").select("id, parent_id").eq("id", input.childId).maybeSingle(),
      supabase
        .from("sign_plans")
        .select("week_start")
        .eq("child_id", input.childId)
        .maybeSingle(),
    ]);
    if (childRes.error) throw new Error(`children lookup failed: ${childRes.error.message}`);
    const ownerId = childRes.data?.parent_id as string | undefined;
    if (!ownerId) return json(403, { error: "no_write_access" });

    const { data: canWrite, error: canWriteErr } = await supabase.rpc("partner_can_write", {
      _owner_id: ownerId,
    });
    if (canWriteErr) throw new Error(`partner_can_write failed: ${canWriteErr.message}`);
    if (canWrite !== true) return json(403, { error: "no_write_access" });

    if (planRes.error) throw new Error(`sign_plans lookup failed: ${planRes.error.message}`);
    // Blocks the requested week AND any older week once a newer plan exists:
    // on Sunday/Monday UTC two Mondays validate, so equality alone was a
    // limit bypass (and let an old week overwrite a newer plan).
    // This read is only a real limit because the caller can't reset the row
    // through the API: sign_plans has no DELETE policy, and the
    // sign_plans_guard_write trigger (20261006030000_sign_plans.sql) rejects
    // any UPDATE that doesn't move week_start forward or that changes
    // child_id / parent_id, plus any week_start > 8 days ahead.
    if (planExistsForWeek(planRes.data?.week_start, input.weekStart)) {
      return json(409, { error: "plan_exists_this_week" });
    }

    // 5. Anthropic.
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SIGN_PLAN_MODEL,
          max_tokens: SIGN_PLAN_MAX_TOKENS,
          system: `${PERSONA_PROMPTS.slp}\n\n${SIGN_PLAN_INSTRUCTION}`,
          messages: [{ role: "user", content: buildUserText(input) }],
        }),
      });
    } catch (e) {
      console.error("generate-sign-plan Anthropic fetch failed:", e instanceof Error ? e.message : e);
      return json(502, { error: "coach_unavailable" });
    }

    if (!response.ok) {
      const t = await response.text();
      console.error("generate-sign-plan Anthropic error:", response.status, t.slice(0, 300));
      return json(502, { error: "coach_unavailable" });
    }

    // 6. Parse + sanitize.
    const completion = await response.json();
    const text = (completion?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-sign-plan: model returned non-JSON:", cleaned.slice(0, 300));
      return json(422, { error: "unusable_plan" });
    }

    const stalledSlugs = new Set(input.signs.filter(isStalled).map((s) => s.slug));
    const plan = sanitizePlan(parsed, input.weekStart, stalledSlugs);
    if (!plan) {
      console.error("generate-sign-plan: no usable focus signs:", cleaned.slice(0, 300));
      return json(422, { error: "unusable_plan" });
    }

    // 7. Persist under the caller's RLS (sign_plans INSERT/UPDATE policies
    // require partner_can_write(parent_id) and child_id owned by parent_id).
    const { error: upsertErr } = await supabase.from("sign_plans").upsert(
      {
        child_id: input.childId,
        parent_id: ownerId,
        week_start: input.weekStart,
        plan,
      },
      { onConflict: "child_id" },
    );
    if (upsertErr) {
      // Two concurrent generates for the same week both pass the 409 read;
      // the guard trigger rejects the slower upsert. Report it as the limit.
      if (upsertErr.message === "sign_plan_week_must_advance") {
        return json(409, { error: "plan_exists_this_week" });
      }
      console.error("generate-sign-plan upsert failed:", upsertErr.code, upsertErr.message);
      return json(500, { error: "save_failed" });
    }

    // 8. Done.
    return json(200, plan);
  } catch (e) {
    console.error("generate-sign-plan error:", e instanceof Error ? e.message : e);
    return json(500, { error: "internal_error" });
  }
});
