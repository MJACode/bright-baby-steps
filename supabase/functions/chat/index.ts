import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS, type PersonaKey } from "../_shared/personas.ts";
import { fireExtractMemory, loadMemoryContext } from "../_shared/memory.ts";

// Valid persona keys — keep in sync with PersonaKey in _shared/personas.ts.
const VALID_PERSONAS: readonly PersonaKey[] = [
  "general",
  "pediatrician",
  "slp",
  "financial",
  "developmental",
  "nutrition",
  "sleep",
] as const;

function isValidPersona(v: unknown): v is PersonaKey {
  return typeof v === "string" && (VALID_PERSONAS as readonly string[]).includes(v);
}

// Persona synonyms used by the natural-language regex override. Order matters
// only insofar as the regex is built once per persona — longer / more specific
// phrases first within each group so e.g. "speech-language pathologist" beats
// a bare "slp" match if both were present.
const PERSONA_SYNONYMS: Record<PersonaKey, string[]> = {
  pediatrician: ["pediatrician", "pediatric doctor", "doctor", "dr"],
  sleep: ["sleep coach", "sleep consultant"],
  nutrition: ["nutritionist", "dietitian"],
  slp: ["speech-language pathologist", "speech therapist", "slp"],
  financial: ["financial advisor", "financial planner", "cfp"],
  developmental: [
    "developmental specialist",
    "child development",
    "occupational therapist",
    "ot",
  ],
  general: [],
};

// Build one combined regex per persona once at module load. Patterns match the
// start of the message (after optional whitespace/punctuation) and accept two
// shapes:
//   1. ask/tell/talk to [the] <persona>...
//   2. as a/an/the <persona>[,:] ...
// We escape each synonym and require a word boundary after it so "dr" doesn't
// match "drink".
const ROUTE_PATTERNS: Array<{ skill: PersonaKey; re: RegExp }> = (() => {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: Array<{ skill: PersonaKey; re: RegExp }> = [];
  for (const skill of VALID_PERSONAS) {
    const syns = PERSONA_SYNONYMS[skill];
    if (!syns || syns.length === 0) continue;
    const alt = syns.map(escape).join("|");
    // Two trigger shapes joined into a single regex.
    const re = new RegExp(
      `^[\\s,.!?]*(?:(?:ask|tell|talk to)\\s+(?:the\\s+)?(?:${alt})\\b|as\\s+(?:a|an|the)\\s+(?:${alt})\\s*[,:])`,
      "i",
    );
    out.push({ skill, re });
  }
  return out;
})();

const CLASSIFIER_SYSTEM_PROMPT =
  "Classify the user's question into exactly one expert category. Reply with ONLY one of these tokens, lowercase, no punctuation: pediatrician, slp, financial, developmental, nutrition, sleep, general. Use 'general' for non-specialist parenting questions, greetings, or off-topic chat.";

async function routeMessage(
  lastUserText: string,
  apiKey: string,
): Promise<{ skill: PersonaKey; source: "explicit" | "classifier" | "fallback" }> {
  // Stage A — regex override. No LLM call.
  for (const { skill, re } of ROUTE_PATTERNS) {
    if (re.test(lastUserText)) {
      return { skill, source: "explicit" };
    }
  }

  // Stage B — Haiku classifier. Falls back to 'general' on any error.
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8,
        temperature: 0,
        system: [
          {
            type: "text",
            text: CLASSIFIER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: lastUserText }],
      }),
    });

    if (!res.ok) {
      console.error("Classifier API error:", res.status, await res.text().catch(() => ""));
      return { skill: "general", source: "fallback" };
    }

    const data = await res.json();
    // Anthropic returns { content: [{ type: 'text', text: '...' }, ...] } for
    // non-streaming responses.
    const raw: unknown = data?.content?.[0]?.text;
    if (typeof raw !== "string") {
      return { skill: "general", source: "fallback" };
    }
    const token = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    if (isValidPersona(token)) {
      return { skill: token, source: "classifier" };
    }
    return { skill: "general", source: "fallback" };
  } catch (err) {
    console.error("Classifier fetch failed:", err);
    return { skill: "general", source: "fallback" };
  }
}

function extractLastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && (m as { role?: unknown }).role === "user") {
      const c = (m as { content?: unknown }).content;
      if (typeof c === "string") return c;
      // Anthropic content-block arrays: pull text out.
      if (Array.isArray(c)) {
        const text = c
          .filter((b: unknown) => b && typeof b === "object" && (b as { type?: unknown }).type === "text")
          .map((b: unknown) => (b as { text?: string }).text ?? "")
          .join(" ");
        if (text) return text;
      }
    }
  }
  return "";
}

// EdgeRuntime.waitUntil is provided by the Supabase Edge runtime but not in
// Deno's lib types. Declare a minimal ambient binding so we can use it.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil: (p: Promise<any>) => void } | undefined;

// Free tier: 10 expert messages / UTC day. Flare+ (subscriptions.tier='plus',
// status in ('active','trialing')) is unlimited. Keep in sync with the
// FREE_DAILY_LIMIT constant in src/hooks/useChatUsage.tsx.
const FREE_DAILY_LIMIT = 10;

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

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();

    const isPremium =
      sub?.tier === "plus" && (sub?.status === "active" || sub?.status === "trialing");

    if (!isPremium) {
      const startOfDayUtc = new Date();
      startOfDayUtc.setUTCHours(0, 0, 0, 0);

      const { count: usedToday } = await supabase
        .from("chat_messages")
        .select("id, chat_conversations!inner(user_id)", { count: "exact", head: true })
        .eq("chat_conversations.user_id", userId)
        .eq("role", "user")
        .gte("created_at", startOfDayUtc.toISOString());

      const used = usedToday ?? 0;
      if (used >= FREE_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({
            error: "daily_limit_reached",
            limit: FREE_DAILY_LIMIT,
            used,
            upgradeUrl: "/upgrade",
            message: `You've used all ${FREE_DAILY_LIMIT} free expert messages today. Upgrade to Flare+ for unlimited access.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { messages, skill, context, childId } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Resolve the persona. Explicit valid keys from legacy clients bypass the
    // router. Anything else ('auto', undefined, unknown string) goes through
    // the two-stage routeMessage.
    let resolvedSkill: PersonaKey;
    let routeSource: "explicit" | "classifier" | "fallback";
    if (isValidPersona(skill)) {
      resolvedSkill = skill;
      routeSource = "explicit";
    } else {
      const lastUserText = extractLastUserText(messages);
      const routed = await routeMessage(lastUserText, ANTHROPIC_API_KEY);
      resolvedSkill = routed.skill;
      routeSource = routed.source;
    }

    const systemPrompt = PERSONA_PROMPTS[resolvedSkill];

    // Per-child memory block. Loaded separately and appended as its own
    // non-cached message so the static skill prompt's cache_control prefix
    // remains a hit across turns (memory mutates each turn, but the prompt
    // before it does not).
    let memoryBlock = "";
    if (childId && typeof childId === "string") {
      memoryBlock = await loadMemoryContext(supabase, childId);
    }

    // Static skill prompt is cached; dynamic child context + memory are not.
    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
    if (context && context.childName) {
      systemContent.push({ type: "text", text: buildContextMessage(context) });
    }
    if (memoryBlock) {
      systemContent.push({ type: "text", text: memoryBlock });
    }

    // Pull the raw JWT once — needed for the fire-and-forget extract call
    // below. authHeader is `Bearer <jwt>`; strip the scheme.
    const jwt = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : authHeader;

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
      // Accumulate the assistant's text so we can pass the full transcript to
      // the memory extractor after the stream closes.
      let assistantText = "";
      let sawMessageStop = false;
      let readLoopCompleted = false;
      try {
        // SSE preamble: a single named 'routed' event the frontend parses on
        // the first chunk to render the routed-expert badge. Must precede any
        // OpenAI-shaped 'data:' frames below. Terminated by a blank line per
        // the SSE spec.
        const routedPayload = JSON.stringify({ skill: resolvedSkill, source: routeSource });
        await writer.write(
          encoder.encode(`event: routed\ndata: ${routedPayload}\n\n`),
        );

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
              const text = parsed.delta.text as string;
              assistantText += text;
              const chunk = JSON.stringify({ choices: [{ delta: { content: text } }] });
              await writer.write(encoder.encode(`data: ${chunk}\n\n`));
            } else if (parsed.type === "message_stop") {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
              sawMessageStop = true;
            }
          }
        }
        readLoopCompleted = true;
      } catch (err) {
        console.error("Stream re-encoding error:", err);
      } finally {
        await writer.close();
      }
      // Only treat the stream as a clean success if we both saw the final
      // message_stop event AND the read loop exited normally. A throw after
      // message_stop would otherwise lead us to extract memory from a
      // half-broken response.
      const streamOk = readLoopCompleted && sawMessageStop;

      // Fire-and-forget memory extraction once the stream is fully drained.
      // Skip when no childId was supplied (no child scope), when the stream
      // didn't complete cleanly, or when nothing was actually generated.
      if (childId && typeof childId === "string" && streamOk && assistantText.trim().length > 0) {
        const transcript = [
          ...(Array.isArray(messages) ? messages : []),
          { role: "assistant", content: assistantText },
        ];
        const promise = fireExtractMemory(jwt, childId, transcript, "chat");
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(promise);
        } else {
          // Local / non-edge runtime fallback. fireExtractMemory swallows
          // its own errors, so this is safe to leave unawaited.
          void promise;
        }
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
