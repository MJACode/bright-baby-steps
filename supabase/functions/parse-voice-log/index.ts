// Edge function: takes a free-form voice transcript and returns structured
// log entries the app can write to feeding_logs / sleep_logs / diaper_logs /
// custom_milestones.
//
// Uses the same Anthropic Claude pattern as `chat`, `briefing`, and
// `weekly-insights` — ANTHROPIC_API_KEY env var, claude-haiku-4-5 model,
// non-streaming JSON-only response.
//
// Premium-gated on the client side via <PremiumGate feature="voice-log">.
// We do not check entitlement here — keep auth/RLS at the table layer.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You convert a parent's spoken note about their baby into structured log entries that match the app's database schema. Return JSON only.

Output shape:
{
  "entries": [
    {
      "type": "feeding" | "sleep" | "diaper" | "milestone" | "temperature",
      "occurred_at": "ISO 8601 timestamp",
      "fields": { ...type-specific fields... },
      "confidence": 0.0 - 1.0,
      "summary": "one-line plain-English summary"
    }
  ],
  "ambiguous": [ "list of things you weren't sure about" ]
}

Type-specific fields (use these EXACT field names — they map directly to DB columns):

- feeding:
    feeding_type: "breast" | "bottle_formula" | "bottle_breast_milk" | "solid"
    amount_oz?: number               (convert ml→oz: ml ÷ 30 ≈ oz; never invent if not stated)
    duration_minutes?: integer
    side?: "left" | "right" | "both"   (only for breast)
    food_description?: string          (only for solid)

- sleep:
    sleep_type: "nap" | "night"
    started_at?: ISO 8601 timestamp     (when sleep began)
    ended_at?: ISO 8601 timestamp       (when sleep ended; null if still asleep)
    duration_minutes?: integer
    quality?: "good" | "ok" | "poor"

- diaper:
    diaper_type: "wet" | "dirty" | "mixed"

- milestone:
    name: string                        (short label, e.g. "First steps")
    achieved_at: YYYY-MM-DD            (date only, not timestamp)
    notes?: string

- temperature:
    temp_value: number                  (the numeric reading, exactly as stated)
    unit: "F" | "C"                     (default "F" if the parent doesn't say; never convert)
    method?: "oral" | "rectal" | "axillary" | "forehead" | "ear"

Rules:
- For temperature, never invent or round a reading the parent didn't state. If no number was given, omit the entry and add a note to "ambiguous".
- Parse relative times ("an hour ago", "at 3am", "just now") against the provided "now" timestamp.
- If a single sentence describes multiple events, return multiple entries.
- "Slept from 8 to 11" → set both started_at AND ended_at AND duration_minutes.
- Default sleep_type to "night" if it's between 7pm-7am, else "nap".
- If the parent says ml, convert to oz (1 oz ≈ 30 ml). Never include amount_ml.
- Never invent specific numbers (volumes, durations, times) the parent didn't state. Omit the field instead.
- If the parent is uncertain, lower confidence and add a note to "ambiguous".
- "Note" or "journal" or "observation" type voice notes are not supported in v1 — surface them in "ambiguous" instead.
- Never wrap in code fences, never return prose. JSON only.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript, now, childContext } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const userMsg =
      `Now: ${now ?? new Date().toISOString()}\n` +
      (childContext ? `Child: ${childContext}\n` : "") +
      `Parent said: """${transcript.trim()}"""`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("parse-voice-log Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Voice parsing temporarily unavailable." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await response.json();
    // Anthropic non-streaming response: { content: [{ type: "text", text: "..." }, ...] }
    const text = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    // Strip optional code fences the model might add despite instructions.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("parse-voice-log: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Could not understand that. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-voice-log error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
