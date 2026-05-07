import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PERSONA_PROMPTS, type PersonaKey } from "../_shared/personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildContextMessage(context: {
  childName: string;
  childAge: string;
  childAgeWeeks?: number;
  isPremature?: boolean;
  twoCaregiversActive: boolean;
  recentActivity: string;
  confirmedAllergens?: string[];
  activeIllnesses?: string[];
  nextAppointment?: string | null;
}): string {
  let block = `[CHILD CONTEXT]
Child: ${context.childName}, ${context.childAge}${context.isPremature ? " (premature)" : " (full term)"}
`;

  if (context.twoCaregiversActive) {
    block += `⚡ Two caregivers active — data from both parents included. Entries tagged "(you)" were logged by the current user; "(partner)" by their co-parent.\n`;
  }

  if (context.confirmedAllergens && context.confirmedAllergens.length > 0) {
    block += `\n🚨 Allergens: ${context.confirmedAllergens.join(", ")}`;
  }

  if (context.activeIllnesses && context.activeIllnesses.length > 0) {
    block += `\n🤒 Active illnesses: ${context.activeIllnesses.join(", ")}`;
  }

  if (context.nextAppointment) {
    block += `\n📅 Next pediatrician appointment: ${context.nextAppointment}`;
  }

  block += `\n\nRecent activity (last 24h):\n${context.recentActivity}\n[/CHILD CONTEXT]`;
  return block;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, skill, context } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const systemPrompt = PERSONA_PROMPTS[skill as PersonaKey] ?? PERSONA_PROMPTS.general;

    // Static skill prompt is cached; dynamic child context is not (changes per child)
    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
    if (context && context.childName) {
      systemContent.push({ type: "text", text: buildContextMessage(context) });
    }

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
        system: systemContent,
        messages,
        stream: true,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 529) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily overloaded. Please try again in a moment." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      return new Response(
        JSON.stringify({ error: `Anthropic error ${response.status}: ${t}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Re-encode Anthropic SSE → OpenAI-compatible SSE (frontend parses OpenAI format)
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            // deno-lint-ignore no-explicit-any
            let parsed: any;
            try { parsed = JSON.parse(jsonStr); } catch { continue; }
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              const chunk = JSON.stringify({ choices: [{ delta: { content: parsed.delta.text } }] });
              await writer.write(encoder.encode(`data: ${chunk}\n\n`));
            } else if (parsed.type === "message_stop") {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
            }
          }
        }
      } catch (err) {
        console.error("Stream re-encoding error:", err);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
