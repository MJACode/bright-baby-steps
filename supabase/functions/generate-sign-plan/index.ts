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
//     off-tone strings are dropped; 0 usable focus signs -> 422.
//
// The request body is never logged. On a parse failure only a truncated model
// output is logged.
//
// Uses the same Anthropic pattern as generate-activity-plan —
// ANTHROPIC_API_KEY env var, model in SIGN_PLAN_MODEL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";
import { SIGN_SLUGS } from "../_shared/signSlugs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Same model as generate-activity-plan / generate-speech-class. Bump here.
const SIGN_PLAN_MODEL = "claude-sonnet-4-6";
const SIGN_PLAN_MAX_TOKENS = 1500;

// Caps from the SignPlan contract.
const MAX_INTRO = 240;
const MAX_WHY = 140;
const MAX_MOMENT = 120;
const MAX_TRY_THIS = 200;
const MAX_FOCUS = 3;
const MAX_MOMENTS = 2;
const MAX_STUCK = 3;

// Request caps.
const MAX_BODY_BYTES = 16 * 1024;
const MAX_SIGNS = 20;
const MAX_AGE_MONTHS = 60;
const MAX_PRACTICE_DAYS_4W = 28;
const MAX_FOCUS_DAYS = 3660;
// Mirrors FOCUS_READY_AFTER_DAYS / stalled() in src/lib/signProgress.ts.
const STALLED_AFTER_FOCUS_DAYS = 14;

const SIGN_SLUG_SET: ReadonlySet<string> = new Set(SIGN_SLUGS);
const STATUSES = new Set(["introduced", "emerging", "signing"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Backstop for the prompt's tone rules (Principle I, FR-025): any model string
// that diagnoses, mentions delays / red flags / "behind" / "should", or counts
// days without practice is dropped rather than shown to a parent.
// "behind" is matched only in its developmental sense so a peekaboo moment
// ("hide a toy behind your back") survives.
const OFF_TONE_RE =
  /\b(delay(?:s|ed)?|fall(?:s|ing|en)? behind|behind (?:schedule|peers|other)|red[\s-]?flags?|should(?:n't)?|diagnos\w*|disorder|missed|skipped|days? without)\b/i;

const FALLBACK_INTRO = "Here are a few signs to model with your baby this week.";

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
- focus: 1 to 3 signs, with 1 or 2 moments each. stuck: 0 to 3 items.
- Recommend only slugs from the provided library list, spelled exactly as given. Never invent a sign.
- Always remind the parent to say the word out loud while signing.
- Celebrate effort. Never diagnose. Never mention delays, red flags, being "behind", or what a baby "should" do. Never mention days without practice, missed days, or streaks.
- Never suggest withholding food, drink, toys, or comfort to get a sign. Model the sign and give the item anyway.
- Moments must be everyday routines: meals, bath, diaper change, play, reading.
- Prefer keeping signs at "emerging" in focus. Move past signs already at "signing" — choose new library signs instead.
- Add a stuck item only for signs marked STALLED in the input, and never for any other sign.
- Keep every string within its character limit. Plain, friendly language for a parent, not a clinician.`;

type SignStatus = "introduced" | "emerging" | "signing";

type SignInput = {
  slug: string;
  status: SignStatus | null;
  isFocus: boolean;
  focusDays: number | null;
  practiceDays4w: number;
};

type ValidInput = {
  childId: string;
  weekStart: string;
  correctedAgeMonths: number;
  signs: SignInput[];
};

type SignPlan = {
  weekStart: string;
  intro: string;
  focus: Array<{ slug: string; why: string; moments: string[] }>;
  stuck: Array<{ slug: string; tryThis: string }>;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** "YYYY-MM-DD" of the UTC Monday that starts the week containing `ms`. */
function utcMondayKey(ms: number): string {
  const d = new Date(ms);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * The client sends its local planWeekStart. Accept it only if it is a real
 * Monday equal to the UTC Monday of (now - 1 day) or (now + 1 day), which
 * covers every U.S. timezone around the Sunday/Monday boundary (research R5).
 */
function isAcceptableWeekStart(weekStart: unknown, nowMs: number): weekStart is string {
  if (typeof weekStart !== "string" || !DATE_RE.test(weekStart)) return false;
  const parsed = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.toISOString().slice(0, 10) !== weekStart) return false; // e.g. 2026-02-30
  if (parsed.getUTCDay() !== 1) return false;
  return weekStart === utcMondayKey(nowMs - DAY_MS) || weekStart === utcMondayKey(nowMs + DAY_MS);
}

/**
 * Allowlist validation. Builds a fresh object from the permitted fields only,
 * so nothing else in the body can reach the prompt. Returns null on any
 * violation.
 */
function validateInput(body: unknown, nowMs: number): ValidInput | null {
  if (!isPlainObject(body)) return null;
  const { childId, weekStart, correctedAgeMonths, signs } = body;

  if (typeof childId !== "string" || !UUID_RE.test(childId)) return null;
  if (!isAcceptableWeekStart(weekStart, nowMs)) return null;
  if (!isIntInRange(correctedAgeMonths, 0, MAX_AGE_MONTHS)) return null;
  if (!Array.isArray(signs) || signs.length > MAX_SIGNS) return null;

  const seen = new Set<string>();
  const cleanSigns: SignInput[] = [];
  for (const raw of signs) {
    if (!isPlainObject(raw)) return null;
    const { slug, status, isFocus, focusDays, practiceDays4w } = raw;
    if (typeof slug !== "string" || !SIGN_SLUG_SET.has(slug) || seen.has(slug)) return null;
    seen.add(slug);
    if (status !== null && !(typeof status === "string" && STATUSES.has(status))) return null;
    if (typeof isFocus !== "boolean") return null;
    if (focusDays !== null && !isIntInRange(focusDays, 0, MAX_FOCUS_DAYS)) return null;
    if (!isIntInRange(practiceDays4w, 0, MAX_PRACTICE_DAYS_4W)) return null;
    cleanSigns.push({
      slug,
      status: status as SignStatus | null,
      isFocus,
      // focusDays is meaningful only for focus signs (contract: null if not focus).
      focusDays: isFocus ? (focusDays as number | null) : null,
      practiceDays4w,
    });
  }

  return { childId, weekStart, correctedAgeMonths, signs: cleanSigns };
}

/** Mirrors stalled() in src/lib/signProgress.ts. */
function isStalled(s: SignInput): boolean {
  return (
    s.isFocus &&
    s.focusDays !== null &&
    s.focusDays >= STALLED_AFTER_FOCUS_DAYS &&
    s.status === "introduced" &&
    s.practiceDays4w >= 1
  );
}

function buildUserText(input: ValidInput): string {
  const bySlug = new Map(input.signs.map((s) => [s.slug, s]));
  const lines = SIGN_SLUGS.map((slug) => {
    const s = bySlug.get(slug);
    if (!s) return `- ${slug}: not started`;
    const parts = [s.status ?? "not started"];
    if (s.isFocus) {
      parts.push(s.focusDays !== null ? `current focus for ${s.focusDays} days` : "current focus");
    }
    // Zero practice days are omitted on purpose (prompt: never mention days
    // without practice; lessons 2026-09-07 on printed zeros).
    if (s.practiceDays4w > 0) parts.push(`modeled on ${s.practiceDays4w} of the last 28 days`);
    if (isStalled(s)) parts.push("STALLED");
    return `- ${slug}: ${parts.join(", ")}`;
  });
  return [
    `Corrected age: ${input.correctedAgeMonths} months.`,
    `Library signs and progress (slug: status):`,
    ...lines,
  ].join("\n");
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length === 0 || s.length > max) return null;
  if (OFF_TONE_RE.test(s)) return null;
  return s;
}

/**
 * Validate model output against SignPlan. Rebuilds every object from known
 * fields only. Returns null when no usable focus sign remains.
 */
function sanitizePlan(
  raw: unknown,
  weekStart: string,
  stalledSlugs: ReadonlySet<string>,
): SignPlan | null {
  if (!isPlainObject(raw)) return null;

  const focus: SignPlan["focus"] = [];
  const focusSeen = new Set<string>();
  for (const item of Array.isArray(raw.focus) ? raw.focus : []) {
    if (focus.length >= MAX_FOCUS) break;
    if (!isPlainObject(item)) continue;
    const slug = item.slug;
    if (typeof slug !== "string" || !SIGN_SLUG_SET.has(slug) || focusSeen.has(slug)) continue;
    const why = cleanString(item.why, MAX_WHY);
    if (!why) continue;
    const moments: string[] = [];
    for (const m of Array.isArray(item.moments) ? item.moments : []) {
      if (moments.length >= MAX_MOMENTS) break;
      const c = cleanString(m, MAX_MOMENT);
      if (c) moments.push(c);
    }
    if (moments.length === 0) continue;
    focusSeen.add(slug);
    focus.push({ slug, why, moments });
  }
  if (focus.length === 0) return null;

  const stuck: SignPlan["stuck"] = [];
  const stuckSeen = new Set<string>();
  for (const item of Array.isArray(raw.stuck) ? raw.stuck : []) {
    if (stuck.length >= MAX_STUCK) break;
    if (!isPlainObject(item)) continue;
    const slug = item.slug;
    if (typeof slug !== "string" || !stalledSlugs.has(slug) || stuckSeen.has(slug)) continue;
    const tryThis = cleanString(item.tryThis, MAX_TRY_THIS);
    if (!tryThis) continue;
    stuckSeen.add(slug);
    stuck.push({ slug, tryThis });
  }

  const intro = cleanString(raw.intro, MAX_INTRO) ?? FALLBACK_INTRO;

  return { weekStart, intro, focus, stuck };
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
    if (planRes.data?.week_start === input.weekStart) {
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
