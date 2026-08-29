// "Speech Class" — generates a guided weekly speech-practice plan for a child.
//
// Flare+ feature. Wraps the `slp` chat persona (single source of truth in
// ../_shared/personas.ts) with the 7-day drill format from
// .claude/skills/drill/SKILL.md and returns a structured SpeechClassPlan JSON.
//
// Non-streaming (called via supabase.functions.invoke) — unlike `chat`, which
// streams. Premium is re-checked server-side here (mirroring chat/index.ts) so
// the Flare+ gate can't be bypassed by calling the function directly.
//
// Uses the same Anthropic Claude pattern as `detect-milestone` — ANTHROPIC_API_KEY
// env var, model claude-sonnet-4-6.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS } from "../_shared/personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Drill-format instruction appended to the slp persona prompt. Asks the model to
// return ONLY the SpeechClassPlan JSON (no code fences).
const PLAN_INSTRUCTION = `You are now building a one-week guided speech-practice plan ("Speech Class") for this child, in the spirit of a short, repeatable daily drill. The plan must be doable solo by one parent, anchored to normal daily routines, warm, ASHA-aligned, and celebratory — never prescriptive medicine, never a diagnosis.

Do the age check first: compare the child's age (use corrected age if premature) to the typical ASHA window for the targeted communication skill. Pick verdict "too_early", "in_window", or "past_window". If past window, the escalation section must point the parent to the relevant professional (a speech-language pathologist or their pediatrician).

Return ONLY this JSON object — no prose, no code fences:
{
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
  "escalation": [ { "redFlag": "a specific observation that means stop and ask an expert", "persona": "slp" | "pediatrician" } ],
  "howToLog": "tell the parent to log a custom milestone on the Milestones tab (source: drill) — keep to one or two sentences",
  "disclaimer": "General educational information, not medical advice or a diagnosis. Consult a speech-language pathologist for professional assessment."
}

Rules:
- dailyPlan: 3-5 items. weekProgression: exactly the 3 buckets above. escalation: 2-3 items.
- Tailor the activity to the child's recent logged words when provided.
- Never diagnose, dose, or imply a delay. If too early, offer a gentler precursor activity in oneRep and set verdict "too_early".
- Never state or imply that the child is delayed, behind, at risk, or that earlier use of this feature would have changed an outcome. "past_window" means only "past the typical age range" — frame it as a neutral prompt to check in with an expert, never as a concern about this child specifically.
- This plan is general educational information, not a diagnosis, screening result, treatment, or medical advice, and is not a substitute for evaluation by a licensed speech-language pathologist. Always return the "disclaimer" field exactly as shown above.`;

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

    // Flare+ gate (mirrors chat/index.ts). Defense-in-depth: the client already
    // gates the card behind <PremiumGate feature="speech-class">.
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
          message: "Speech Class is a Flare+ feature.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      childName,
      ageMonths,
      isPremature,
      correctedAgeMonths,
      recentWords,
      targetMilestone,
    } = await req.json();

    if (typeof ageMonths !== "number") {
      return new Response(
        JSON.stringify({ error: "ageMonths is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const wordList =
      Array.isArray(recentWords) && recentWords.length > 0
        ? recentWords.slice(0, 30).join(", ")
        : "none logged yet";

    const userText = [
      `Child: ${childName || "the baby"}, age ${ageMonths} months.`,
      isPremature && typeof correctedAgeMonths === "number"
        ? `Premature — corrected age ${correctedAgeMonths} months; use the corrected age for the age check.`
        : "",
      `Recent words logged: ${wordList}.`,
      targetMilestone
        ? `Focus the plan on: ${targetMilestone}.`
        : "Choose the most age-appropriate communication skill to target.",
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
        max_tokens: 1200,
        system: `${PERSONA_PROMPTS.slp}\n\n${PLAN_INSTRUCTION}`,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("generate-speech-class Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Speech Class is temporarily unavailable." }),
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
      console.error("generate-speech-class: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't build the plan. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-speech-class error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
