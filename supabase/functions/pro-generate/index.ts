// "Pro Generate" — Grace Flare Pro (SLP product) AI drafting endpoint.
//
// One endpoint, three kinds:
//   - session_plan  → a structured therapy-session plan draft for the clinician
//   - goals         → measurable goal drafts (Given/[child] will/criterion frame)
//   - home_program  → a parent-facing weekly home program (SpeechClassPlan shape
//                     + parentNote) the SLP shares by link
//
// Mirrors generate-speech-class exactly in structure (CORS, session client,
// auth extraction, Anthropic fetch, code-fence stripping, JSON parse w/ 422),
// and visit-prep-questions for the server-stamped-disclaimer pattern.
//
// Entitlement is re-checked server-side (defense-in-depth): the caller must
// have an slp_profiles row AND a subscriptions row with tier='pro' that is
// active, or trialing with an unexpired trial_ends_at. The trial-expiry
// comparison is mandatory here — no billing webhook flips expired trials, so
// status stays 'trialing' forever after start_pro_trial() and the timestamp
// is the only source of truth.
//
// Non-streaming (called via supabase.functions.invoke). All DB reads use the
// caller's session client so RLS applies — no service-role key. This
// function performs NO database writes; the client persists accepted drafts
// into slp_session_plans / slp_client_goals / slp_home_programs itself.
//
// Secrets required (already set for sibling functions): ANTHROPIC_API_KEY.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KINDS = ["session_plan", "goals", "home_program"] as const;
type Kind = (typeof KINDS)[number];

const SETTINGS = ["clinic", "school", "teletherapy", "home"] as const;
type Setting = (typeof SETTINGS)[number];

const AREAS = [
  "expressive",
  "receptive",
  "articulation",
  "pragmatics",
  "fluency",
  "mixed",
] as const;
type Area = (typeof AREAS)[number];

const MAX_GOALS = 10;
const MAX_GOAL_CHARS = 300;

// Audience preamble for the Pro surface. Defined HERE, not in
// _shared/personas.ts, so the consumer chat's cached persona prompts are
// untouched (prompt-cache stability — see lessons-backend 2026-05-17).
export const PRO_AUDIENCE_PREAMBLE = `You are assisting a licensed speech-language pathologist (SLP), not a parent. Use professional terminology and ASHA-aligned practice. You produce drafts; the clinician reviews, edits, and decides. Never produce or imply a diagnosis. If the requested target is clearly outside the child's developmental range, say so in the draft.`;

// Server-stamped disclaimers (visit-prep pattern): pinned in code and
// OVERWRITTEN onto the parsed model output before returning — never trust
// the model's copy.
const PRO_DISCLAIMER =
  "AI-generated draft for review by a licensed speech-language pathologist. Not a diagnosis, a treatment plan of record, or a substitute for clinical judgment. Verify all content before clinical use.";
const PARENT_DISCLAIMER =
  "This home program was drafted with AI assistance and shared with you by your child's speech-language pathologist. It contains educational suggestions, not medical advice. Every child develops at their own pace. Contact your SLP with any questions or concerns.";

const SESSION_PLAN_INSTRUCTION = `You are drafting one therapy session plan for the clinician to review and adapt. Shape the plan to the stated session length and setting.

Return ONLY this JSON object — no prose, no code fences:
{
  "focus": "one sentence stating the clinical focus of this session",
  "ageCheck": {
    "ageMonths": <number>,
    "typicalWindow": "typical ASHA age window for the targeted skill, e.g. '18-24 months (ASHA)'",
    "verdict": "too_early" | "in_window" | "past_window"
  },
  "warmup": { "name": "...", "minutes": <number>, "description": "..." },
  "activities": [
    {
      "name": "...",
      "targetGoal": "which client goal this targets (quote or paraphrase it)",
      "materials": "materials needed, comma-separated",
      "steps": ["step 1", "step 2", "..."],
      "cues": ["cueing hierarchy entries, most to least support"],
      "dataCollection": "what to tally and how (e.g. '+/- per trial, 10 trials')"
    }
  ],
  "wrapUp": "1-2 sentences on closing the session and previewing carryover",
  "homeCarryover": "one concrete carryover suggestion to hand the family",
  "disclaimer": "${PRO_DISCLAIMER}"
}

Rules:
- activities: 2-4 items. Minutes across warmup + activities should roughly fit the stated session length.
- Anchor activities to the provided goals when given; otherwise choose age-appropriate targets and say so in targetGoal.
- Professional register: cueing hierarchies, trial counts, prompt fading — this is for the SLP, not the family.
- Always return the "disclaimer" field exactly as shown above.`;

const GOALS_INSTRUCTION = `You are drafting measurable therapy goals for the clinician to review and adapt.

Return ONLY this JSON object — no prose, no code fences:
{
  "goals": [
    {
      "goalText": "the full measurable goal statement",
      "shortTermObjectives": ["2-3 stepping-stone objectives"],
      "measurement": "how progress is measured (e.g. clinician tally, language sample)",
      "criterion": "mastery criterion (e.g. 80% accuracy across 3 consecutive sessions)",
      "timeframe": "target timeframe (e.g. 'by 6 months')"
    }
  ],
  "notes": "1-3 sentences of drafting notes for the clinician (assumptions made, what to verify)",
  "disclaimer": "${PRO_DISCLAIMER}"
}

Rules:
- goals: 2-4 items. Each goalText MUST follow the measurable frame: "Given [condition/support], [child's name] will [observable behavior] in [context] with [criterion] accuracy across [N] consecutive sessions, as measured by [method]."
- Target the stated goal area and timeframe when provided; otherwise pick the most age-appropriate area and note the assumption in "notes".
- Objectives must be observable behaviors, not internal states.
- Always return the "disclaimer" field exactly as shown above.`;

// JSON shape copied VERBATIM from generate-speech-class's PLAN_INSTRUCTION so
// the frontend can reuse the SpeechClassPlan type — plus one extra top-level
// field, parentNote. This kind alone keeps the warm parent-facing tone: the
// output is handed to the family on the shared home-program page.
const HOME_PROGRAM_INSTRUCTION = `You are now building a one-week home practice program the SLP will share with this child's family, in the spirit of a short, repeatable daily drill. The program must be doable solo by one parent, anchored to normal daily routines, warm, ASHA-aligned, and celebratory — never prescriptive medicine, never a diagnosis. Write every field in warm, plain, parent-facing language (this kind is for the family, unlike your other drafts).

Do the age check first: compare the child's age to the typical ASHA window for the targeted communication skill. Pick verdict "too_early", "in_window", or "past_window".

Return ONLY this JSON object — no prose, no code fences:
{
  "parentNote": "a warm 2-4 sentence intro addressed to the family from the therapy plan — what you'll practice this week and why it matters",
  "goal": "one warm sentence in plain language",
  "ageCheck": {
    "ageMonths": <number>,
    "correctedAgeMonths": <number, omit if not premature>,
    "typicalWindow": "e.g. '9-14 months (ASHA)'",
    "verdict": "too_early" | "in_window" | "past_window"
  },
  "oneRep": {
    "timeMinutes": <number, default 5>,
    "setup": "props from around the house + positioning",
    "whatYouDo": "2-3 short lines",
    "successSignal": "what 'we did it' looks like"
  },
  "dailyPlan": [ { "anchor": "routine anchor e.g. 'post-feed'", "rep": "what to do then" } ],
  "weekProgression": [ { "days": "Days 1-2", "focus": "..." }, { "days": "Days 3-4", "focus": "..." }, { "days": "Days 5-7", "focus": "..." } ],
  "escalation": [ { "redFlag": "a specific observation that means pause and check in with the SLP", "persona": "slp" | "pediatrician" } ],
  "howToLog": "tell the family to check off each completed day right on this shared page — they do not need a Grace Flare account or app. Keep to one or two sentences.",
  "disclaimer": "${PARENT_DISCLAIMER}"
}

Rules:
- dailyPlan: 3-5 items. weekProgression: exactly the 3 buckets above. escalation: 2-3 items.
- Anchor the activity to the provided therapy goals when given.
- Never diagnose, dose, or imply a delay. If too early, offer a gentler precursor activity in oneRep and set verdict "too_early".
- Never state or imply that the child is delayed, behind, at risk, or that earlier practice would have changed an outcome. "past_window" means only "past the typical age range" — frame it as a neutral prompt to check in with the SLP, never as a concern about this child specifically.
- Escalation items should direct the family back to their own SLP (persona "slp") except for clearly medical observations (persona "pediatrician").
- Always return the "disclaimer" field exactly as shown above.`;

const KIND_INSTRUCTIONS: Record<Kind, string> = {
  session_plan: SESSION_PLAN_INSTRUCTION,
  goals: GOALS_INSTRUCTION,
  home_program: HOME_PROGRAM_INSTRUCTION,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Body validation (cheap, before any DB reads). ──
    const body = await req.json().catch(() => null);
    const bad = (message: string) =>
      new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    const kind = body?.kind;
    if (!KINDS.includes(kind)) {
      return bad("kind must be one of session_plan, goals, home_program");
    }

    const ageMonths = body?.ageMonths;
    if (
      typeof ageMonths !== "number" ||
      !Number.isFinite(ageMonths) ||
      ageMonths < 0 ||
      ageMonths > 216
    ) {
      return bad("ageMonths must be a number between 0 and 216");
    }

    const displayName = body?.displayName;
    if (
      typeof displayName !== "string" ||
      displayName.trim().length === 0 ||
      displayName.length > 40
    ) {
      return bad("displayName must be a non-empty string of at most 40 characters");
    }

    const rawGoals = body?.goals;
    if (rawGoals !== undefined && !Array.isArray(rawGoals)) {
      return bad("goals must be an array of strings");
    }
    const goals: string[] = (Array.isArray(rawGoals) ? rawGoals : [])
      .filter((g: unknown): g is string => typeof g === "string" && g.trim().length > 0)
      .slice(0, MAX_GOALS)
      .map((g) => g.trim().slice(0, MAX_GOAL_CHARS));

    const setting = body?.setting;
    if (setting !== undefined && !SETTINGS.includes(setting)) {
      return bad("setting must be one of clinic, school, teletherapy, home");
    }

    const area = body?.area;
    if (area !== undefined && !AREAS.includes(area)) {
      return bad(
        "area must be one of expressive, receptive, articulation, pragmatics, fluency, mixed"
      );
    }

    const sessionMinutes =
      typeof body?.sessionMinutes === "number" && Number.isFinite(body.sessionMinutes)
        ? Math.min(Math.max(Math.round(body.sessionMinutes), 10), 180)
        : 30;

    const timeframe =
      typeof body?.timeframe === "string" ? body.timeframe.trim().slice(0, 100) : "";
    const targetMilestone =
      typeof body?.targetMilestone === "string"
        ? body.targetMilestone.trim().slice(0, 300)
        : "";

    // ── Pro entitlement gate (order: profile, then subscription). Both reads
    // are independent — fetch in parallel (lessons-backend 2026-07-05).
    const [{ data: proProfile }, { data: sub }] = await Promise.all([
      supabase
        .from("slp_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("tier, status, trial_ends_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (!proProfile) {
      return new Response(
        JSON.stringify({ error: "pro_profile_required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The trial-expiry comparison is mandatory here — start_pro_trial() only
    // stamps trial_ends_at; no billing webhook flips expired trials back, so
    // status stays 'trialing' forever and the timestamp is the sole gate.
    const isPro =
      sub?.tier === "pro" &&
      (sub?.status === "active" ||
        (sub?.status === "trialing" &&
          sub?.trial_ends_at &&
          new Date(sub.trial_ends_at) > new Date()));

    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "pro_required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // ── Prompt assembly. ──
    const goalLines =
      goals.length > 0
        ? `Current therapy goals:\n${goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
        : "No therapy goals on file yet.";

    const userText = [
      `Client: ${displayName.trim()}, age ${ageMonths} months.`,
      goalLines,
      kind === "session_plan"
        ? `Session length: ${sessionMinutes} minutes. Setting: ${(setting as Setting | undefined) ?? "clinic"}.`
        : "",
      kind === "goals" && area ? `Goal area: ${area as Area}.` : "",
      kind === "goals" && timeframe ? `Timeframe: ${timeframe}.` : "",
      targetMilestone
        ? `Focus on: ${targetMilestone}.`
        : "Choose the most age-appropriate communication target.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: `${PERSONA_PROMPTS.slp}\n\n${PRO_AUDIENCE_PREAMBLE}\n\n${KIND_INSTRUCTIONS[kind as Kind]}`,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("pro-generate Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Drafting is temporarily unavailable." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await response.json();

    // A max_tokens stop means the JSON is cut off mid-stream — surface it as
    // a distinct upstream failure rather than letting the truncated payload
    // fall through to the generic 422 non-JSON branch.
    if (json?.stop_reason === "max_tokens") {
      console.error("pro-generate: output truncated at max_tokens for kind:", kind);
      return new Response(
        JSON.stringify({ error: "generation_truncated" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("pro-generate: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't build the draft. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-stamped disclaimer (visit-prep pattern): overwrite whatever the
    // model returned with the pinned string for this kind.
    (parsed as Record<string, unknown>).disclaimer =
      kind === "home_program" ? PARENT_DISCLAIMER : PRO_DISCLAIMER;

    // NO database writes here — the client persists accepted drafts.
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pro-generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
