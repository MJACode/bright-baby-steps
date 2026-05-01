// Vision-powered milestone detection. Parent uploads a photo to milestone-photos
// then sends us a signed URL; we ask Claude to identify the milestone.
//
// Uses the same Anthropic Claude pattern as `chat`, `briefing`, and
// `weekly-insights` — ANTHROPIC_API_KEY env var. Model: claude-sonnet-4-6
// for vision (Haiku doesn't accept image inputs as of 2026-04).
//
// Premium-gated on the client side via <PremiumGate feature="photo-milestones">.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a developmental milestone detector. Given a photo of a baby or toddler, identify the SINGLE most likely developmental milestone being demonstrated.

Return ONLY a JSON object:
{
  "title": "short milestone title (e.g. 'Sitting unsupported', 'First steps', 'Pincer grasp')",
  "category": "motor" | "language" | "social" | "cognitive" | "feeding",
  "confidence": 0.0 - 1.0,
  "age_range_months": [min, max],
  "caption": "one warm, short sentence celebrating the moment (≤ 15 words). No emojis.",
  "evidence": "what specifically in the photo led to your conclusion (≤ 20 words)"
}

Rules:
- If no baby/child is visible, return confidence < 0.2 and title "No milestone detected".
- Be CONSERVATIVE about confidence. 0.7+ means "very clearly demonstrated". 0.4-0.7 means "plausibly". <0.4 means "guess".
- Never include medical diagnoses or concerns. This is for celebration only.
- caption is for the parent — warm, present-tense, specific. Bad: "Look at this milestone!" Good: "Holding the bottle steady, all on her own."
- Never wrap in code fences. JSON only.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { signedUrl, childAgeMonths } = await req.json();
    if (!signedUrl) {
      return new Response(JSON.stringify({ error: "signedUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const userText =
      (childAgeMonths != null ? `Child is ~${childAgeMonths} months old. ` : "") +
      "Identify the milestone shown.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: signedUrl } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("detect-milestone Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Detection temporarily unavailable." }),
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
      console.error("detect-milestone: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't read the photo. Try another?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-milestone error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
