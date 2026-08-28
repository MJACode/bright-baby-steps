import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { PERSONA_PROMPTS, type PersonaKey } from "../_shared/personas.ts";
import { humanizeSlug, loadChildCore } from "../_shared/childContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Static, model-independent fallback. Never blocks the row: any LLM/runtime
// failure returns HTTP 200 with one of these so the inline teaser always has
// something warm to show in the row.
function fallbackAnswer(childName?: string): string {
  return childName
    ? `Every baby moves at their own pace — short, playful bursts of practice a few times a day are plenty. ${childName} has time.`
    : `Every baby moves at their own pace — short, playful bursts of practice a few times a day are plenty. Your little one has time.`;
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
    // Shared loader handles the fetch + canonical age string (RLS-scoped).
    const core = await loadChildCore(supabase, childId);

    if (!core) {
      return new Response(JSON.stringify({ error: "Child not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    childName = core.name;

    // ---- LLM section. Any failure from here on degrades to a 200 fallback. ----
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("next-step-peek: ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ answer: fallbackAnswer(childName) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Leading cached persona block keeps the inline peek consistent with the
    // shared personas. The appended block constrains length/format for the row.
    const previewInstruction =
      "You are giving a short answer that appears inline on the home screen. It is the whole answer — the parent cannot ask a follow-up, so leave nothing hanging. Answer in 2-3 short sentences, 60 words max. Give one concrete, low-pressure suggestion. Be warm and celebratory, never diagnostic or alarming. Do not greet, do not sign off, do not ask follow-up questions. Plain text only — no markdown, no bullet points.";

    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: PERSONA_PROMPTS[personaKey], cache_control: { type: "ephemeral" } },
      { type: "text", text: previewInstruction },
    ];

    const interestsLine = core.interests.length > 0
      ? `\nInterests: ${core.interests.map(humanizeSlug).join(", ")}`
      : "";
    const userMessage =
      `Child: ${core.name}, ${core.ageString}${core.isPremature ? " (premature)" : ""}.${interestsLine}\n\nParent's request: ${seedPrompt}`;

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
