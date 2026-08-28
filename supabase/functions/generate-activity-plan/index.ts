// "Weekly Play Plan" — generates a guided weekly activity plan for a child.
//
// Flare+ feature. Wraps the `developmental` chat persona (single source of
// truth in ../_shared/personas.ts) with a 7-day play-plan format composed from
// the curated activity library (src/data/activityLibrary.ts on the client) and
// returns a structured ActivityPlan JSON the client upserts into
// public.activity_plans.
//
// Non-streaming (called via supabase.functions.invoke) — unlike `chat`, which
// streams. Premium is re-checked server-side here (mirroring
// generate-speech-class/index.ts) so the Flare+ gate can't be bypassed by
// calling the function directly. No minimum-age gate: activities exist from
// 0 months.
//
// Uses the same Anthropic Claude pattern as `generate-speech-class` —
// ANTHROPIC_API_KEY env var, model claude-sonnet-4-6.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Play-plan instruction appended to the developmental persona prompt. Asks the
// model to return ONLY the ActivityPlan JSON (no code fences).
const PLAN_INSTRUCTION = `You are now building a one-week play plan ("Weekly Play Plan") for this child — seven short, doable-at-home activities that support development through play. The plan must be doable solo by one tired parent with household props, warm, evidence-aligned (CDC/AAP milestone framing), and celebratory — never prescriptive medicine, never a diagnosis.

Do the age check first: compare the child's age (use corrected age if premature) to the typical developmental window for the skills the week targets. Pick verdict "too_early", "in_window", or "past_window". If past window, the escalation section must point the parent to the relevant professional (their pediatrician or an occupational therapist).

Return ONLY this JSON object — no prose, no code fences:
{
  "goal": "one warm sentence in plain language",
  "ageCheck": {
    "ageMonths": <number>,
    "correctedAgeMonths": <number, omit if not premature>,
    "typicalWindow": "e.g. '4-8 months (CDC/AAP)'",
    "verdict": "too_early" | "in_window" | "past_window"
  },
  "days": [
    {
      "day": <number, 1..7>,
      "title": "short activity name",
      "domain": "motor" | "language" | "cognitive" | "social" | "sensory",
      "timeMinutes": <number, default 5-10>,
      "whatYouDo": "2-3 short lines",
      "watchFor": "what 'we did it' looks like — one line",
      "activitySlug": "<slug from the candidate list this day is based on, or null for an original idea>"
    }
  ],
  "escalation": [ { "redFlag": "a specific observation that means stop and ask an expert", "persona": "developmental" | "pediatrician" } ],
  "howToLog": "tell the parent to tap 'Tried it' on the activity card or log a custom milestone — keep to one or two sentences",
  "disclaimer": "General educational information, not medical advice or a diagnosis. Consult your pediatrician or a licensed developmental specialist for professional assessment."
}

Rules:
- days: exactly 7 entries, day 1 through 7. escalation: 2-3 items.
- Vary domains across the week — don't repeat the same domain on consecutive days when the candidate list allows variety.
- Prefer composing days from the provided candidate activities: when a day is based on one, set "activitySlug" to that candidate's slug; use null only for original ideas.
- Avoid repeating activities the family has recently tried (titles provided) — pick fresh candidates or fresh ideas instead.
- Respect the child's selected interests and temperament: lean into listed interests, and keep the pacing gentle for sensitive or slow-to-warm temperaments.
- Every activity must be safe with constant adult supervision and use only household items; call out supervision explicitly for anything involving water, small objects, or tummy time.
- Never diagnose, dose, or imply a delay. If too early, offer gentler precursor activities and set verdict "too_early".
- Never state or imply that the child is delayed, behind, at risk, or that earlier use of this feature would have changed an outcome. "past_window" means only "past the typical age range" — frame it as a neutral prompt to check in with an expert, never as a concern about this child specifically.
- This plan is general educational information, not a diagnosis, screening result, treatment, or medical advice, and is not a substitute for evaluation by a pediatrician or licensed developmental specialist. Always return the "disclaimer" field exactly as shown above.`;

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

    // Flare+ gate (mirrors generate-speech-class/index.ts). Defense-in-depth:
    // the client already gates the card behind <PremiumGate>.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();

    const isPremium =
      sub?.tier === "plus" && (sub?.status === "active" || sub?.status === "trialing");

    if (!isPremium) {
      return new Response(
        JSON.stringify({
          error: "premium_required",
          upgradeUrl: "/upgrade",
          message: "The Weekly Play Plan is a Flare+ feature.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      // childId is accepted for parity with the client call shape; persistence
      // (upsert into activity_plans) happens client-side under RLS.
      childId: _childId,
      childName,
      ageMonths,
      isPremature,
      correctedAgeMonths,
      interests,
      temperament,
      recentlyTried,
      candidateActivities,
    } = await req.json();

    if (typeof ageMonths !== "number") {
      return new Response(
        JSON.stringify({ error: "ageMonths is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const interestList =
      Array.isArray(interests) && interests.length > 0
        ? interests.slice(0, 6).join(", ")
        : "none selected";

    const triedList =
      Array.isArray(recentlyTried) && recentlyTried.length > 0
        ? recentlyTried.slice(0, 30).join(", ")
        : "none yet";

    const candidateList =
      Array.isArray(candidateActivities) && candidateActivities.length > 0
        ? candidateActivities
            .slice(0, 40)
            .map(
              (a: { slug: string; title: string; domain: string }) =>
                `${a.slug} — "${a.title}" (${a.domain})`
            )
            .join("; ")
        : "none provided — compose original ideas and set activitySlug to null";

    const userText = [
      `Child: ${childName || "the baby"}, age ${ageMonths} months.`,
      isPremature && typeof correctedAgeMonths === "number"
        ? `Premature — corrected age ${correctedAgeMonths} months; use the corrected age for the age check.`
        : "",
      `Selected interests: ${interestList}.`,
      temperament ? `Temperament: ${temperament}.` : "",
      `Recently tried activities (avoid repeating): ${triedList}.`,
      `Candidate activities (slug — title (domain)): ${candidateList}.`,
    ]
      .filter(Boolean)
      .join(" ");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `${PERSONA_PROMPTS.developmental}\n\n${PLAN_INSTRUCTION}`,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("generate-activity-plan Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "The Weekly Play Plan is temporarily unavailable." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await response.json();
    const text = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-activity-plan: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't build the plan. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-activity-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
