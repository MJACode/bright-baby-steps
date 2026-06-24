import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { PERSONA_PROMPTS, type PersonaKey } from "../_shared/personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Static, model-independent fallback. Never blocks the row: any LLM/runtime
// failure returns HTTP 200 with one of these so the inline teaser always has
// something warm to show and the "Continue in chat" button still works.
function fallbackAnswer(childName?: string): string {
  return childName
    ? `Every baby moves at their own pace — short, playful bursts of practice a few times a day are plenty. Tap Continue in chat for ideas tailored to ${childName}.`
    : `Every baby moves at their own pace — short, playful bursts of practice a few times a day are plenty. Tap Continue in chat for ideas tailored to your little one.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // childName is captured as soon as the child row is fetched so the catch
  // branch can personalize the fallback even if the failure happens later.
  let childName: string | undefined;

  try {
    // ---- Auth (proper 401, never degraded to fallback) ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Anon client carrying the caller's Authorization header so RLS applies.
    // No service-role key — the child fetch must be gated by RLS.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Request validation (proper 400, never degraded to fallback) ----
    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { childId, skill } = body ?? {};
    let { seedPrompt } = body ?? {};

    if (!childId || !seedPrompt || !skill) {
      return new Response(
        JSON.stringify({ error: "childId, seedPrompt, and skill are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Own-property check, not `in` — the prototype chain ("constructor",
    // "toString", …) would pass an `in` guard and index to a garbage system
    // prompt downstream. Allow-list against the literal's own keys only.
    if (
      typeof skill !== "string" ||
      !Object.prototype.hasOwnProperty.call(PERSONA_PROMPTS, skill)
    ) {
      return new Response(JSON.stringify({ error: "Invalid skill" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const personaKey = skill as PersonaKey;

    // Defensive truncation — don't reject overlong seed prompts.
    if (typeof seedPrompt === "string" && seedPrompt.length > 500) {
      seedPrompt = seedPrompt.slice(0, 500);
    }

    // ---- Child fetch (proper 404, never degraded to fallback) ----
    const { data: child } = await supabase
      .from("children")
      .select("name, date_of_birth, is_premature, due_date")
      .eq("id", childId)
      .single();

    if (!child) {
      return new Response(JSON.stringify({ error: "Child not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    childName = child.name;

    // Calculate age (same block as briefing)
    const dob = new Date(child.date_of_birth);
    const now = new Date();
    const ageDays = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
    const ageWeeks = Math.floor(ageDays / 7);
    const ageMonths = Math.floor(ageDays / 30.44);
    const ageStr = ageMonths < 1
      ? `${ageWeeks} weeks old`
      : ageMonths < 24
      ? `${ageMonths} months old`
      : `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months old`;

    // ---- LLM section. Any failure from here on degrades to a 200 fallback. ----
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("next-step-peek: ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ answer: fallbackAnswer(childName) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Leading cached persona block keeps the inline peek consistent with the
    // in-app chat. The appended block constrains length/format for the teaser.
    const previewInstruction =
      "You are giving a short preview answer that will appear inline on the home screen, above a 'Continue in chat' button. Answer in 2-3 short sentences, 60 words max. Give one concrete, low-pressure suggestion. Be warm and celebratory, never diagnostic or alarming. Do not greet, do not sign off, do not ask follow-up questions. Plain text only — no markdown, no bullet points.";

    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: PERSONA_PROMPTS[personaKey], cache_control: { type: "ephemeral" } },
      { type: "text", text: previewInstruction },
    ];

    const userMessage =
      `Child: ${child.name}, ${ageStr}${child.is_premature ? " (premature)" : ""}.\n\nParent's request: ${seedPrompt}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        system: systemContent,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.6,
        max_tokens: 160,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("next-step-peek LLM error:", errText);
      return new Response(JSON.stringify({ answer: fallbackAnswer(childName) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmData = await response.json();
    const answer = (llmData.content?.[0]?.text || "").trim();

    if (!answer) {
      console.error("next-step-peek: empty content from LLM");
      return new Response(JSON.stringify({ answer: fallbackAnswer(childName) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Runtime/LLM failure → never block the row. Return 200 with the static
    // fallback (personalized if the child was already fetched).
    console.error("next-step-peek error:", err);
    return new Response(JSON.stringify({ answer: fallbackAnswer(childName) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
