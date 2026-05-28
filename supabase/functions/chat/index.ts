import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PERSONA_PROMPTS, type PersonaKey } from "../_shared/personas.ts";
import { fireExtractMemory, loadMemoryContext } from "../_shared/memory.ts";
import { CHILD_DATA_TOOLS, dispatchChildDataTool } from "../_shared/childDataTools.ts";

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

    // Tool-use is only enabled when a childId is supplied; without one, none
    // of the CHILD_DATA_TOOLS are usable (they all require child_id, except
    // list_accessible_children, which is also a no-op outside of a child
    // scope). Passing `tools` only when meaningful keeps prompt caching tight
    // on the no-child path.
    const hasChildScope = typeof childId === "string" && childId.length > 0;
    const toolsField = hasChildScope ? { tools: CHILD_DATA_TOOLS } : {};

    // Hard cap on tool-use turns to prevent runaway. Each iteration is one
    // Anthropic round trip; the first cycle that returns stop_reason other
    // than 'tool_use' is the terminal turn.
    const MAX_TOOL_TURNS = 5;

    // Local working copy of the messages array. The agentic loop mutates this
    // across tool-use turns: append the assistant message (text + tool_use
    // blocks) and a user message with tool_result blocks, then call again.
    // deno-lint-ignore no-explicit-any
    const workingMessages: any[] = Array.isArray(messages) ? [...messages] : [];

    // Helper to build a turn's Anthropic request body. The final allowed turn
    // drops `tools` so Claude is forced to wrap up rather than request lookups
    // we can't satisfy.
    const buildTurnBody = (isLastAllowedTurn: boolean) => ({
      model: "claude-haiku-4-5-20251001",
      system: systemContent,
      messages: workingMessages,
      stream: true,
      max_tokens: 1024,
      ...(isLastAllowedTurn ? {} : toolsField),
    });

    // First Anthropic call happens BEFORE we open the SSE stream so 429/529
    // can still be returned as JSON (preserves the original error contract
    // the frontend's daily_limit / overload handlers rely on). Subsequent
    // (tool-use) turns happen inside the IIFE; their errors surface as
    // streamed `event: error` frames.
    const firstResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTurnBody(MAX_TOOL_TURNS === 0)),
    });

    if (!firstResponse.ok) {
      if (firstResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (firstResponse.status === 529) {
        return new Response(
          JSON.stringify({ error: "AI service temporarily overloaded. Please try again in a moment." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await firstResponse.text().catch(() => "");
      console.error("Anthropic API error:", firstResponse.status, t);
      return new Response(
        JSON.stringify({ error: `Anthropic error ${firstResponse.status}: ${t}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Re-encode Anthropic SSE → OpenAI-compatible SSE (frontend parses OpenAI format).
    // The agentic loop below may make multiple Anthropic calls; only the final
    // turn's text deltas are forwarded as OpenAI-shaped `data:` frames. Tool
    // turns surface as named SSE events ('tool_use' / 'tool_result') so the
    // widget can render in-flight indicators without leaking tool payloads.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Run the agentic loop in a background task so the Response can return
    // immediately and the client starts seeing bytes ASAP.
    (async () => {
      let finalAssistantText = "";
      let cleanFinish = false;

      try {
        // SSE preamble: a single named 'routed' event the frontend parses on
        // the first chunk to render the routed-expert badge. Must precede any
        // OpenAI-shaped 'data:' frames below. Terminated by a blank line per
        // the SSE spec.
        const routedPayload = JSON.stringify({ skill: resolvedSkill, source: routeSource });
        await writer.write(
          encoder.encode(`event: routed\ndata: ${routedPayload}\n\n`),
        );

        for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
          const isLastAllowedTurn = turn === MAX_TOOL_TURNS;

          // Turn 0 uses the already-issued `firstResponse`; subsequent turns
          // issue a fresh fetch with the updated workingMessages.
          let response: Response;
          if (turn === 0) {
            response = firstResponse;
          } else {
            response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "prompt-caching-2024-07-31",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(buildTurnBody(isLastAllowedTurn)),
            });

            if (!response.ok) {
              const t = await response.text().catch(() => "");
              console.error("Anthropic API error (mid-stream):", response.status, t);
              const errPayload = JSON.stringify({
                error: `Anthropic error ${response.status}`,
              });
              await writer.write(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
              break;
            }
          }

          // ---------------------------------------------------------------
          // Parse this turn's stream.
          //
          // We track:
          //   - per-block state in `blocks[i]` keyed by Anthropic's block
          //     index, recording type ('text' | 'tool_use'), tool name + id,
          //     and an accumulating `input_json` string for tool_use blocks
          //     (Anthropic streams the input as partial JSON deltas).
          //   - `stop_reason` from the final message_delta event.
          //   - `turnAssistantText` for memory extraction at end of turn.
          //
          // Text deltas are forwarded as OpenAI-shape `data:` frames so the
          // existing frontend parser keeps working. Tool blocks are NOT
          // forwarded mid-stream; we wait until message_delta then dispatch.
          // ---------------------------------------------------------------
          interface BlockState {
            type: "text" | "tool_use" | "other";
            tool_use_id?: string;
            tool_name?: string;
            input_json?: string;
          }
          const blocks: Record<number, BlockState> = {};
          let stopReason: string | null = null;
          let turnAssistantText = "";

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

              if (parsed.type === "content_block_start") {
                const idx = parsed.index as number;
                const cb = parsed.content_block ?? {};
                if (cb.type === "tool_use") {
                  blocks[idx] = {
                    type: "tool_use",
                    tool_use_id: cb.id as string,
                    tool_name: cb.name as string,
                    input_json: "",
                  };
                } else if (cb.type === "text") {
                  blocks[idx] = { type: "text" };
                } else {
                  blocks[idx] = { type: "other" };
                }
              } else if (parsed.type === "content_block_delta") {
                const idx = parsed.index as number;
                const block = blocks[idx];
                if (!block) continue;
                if (block.type === "text" && parsed.delta?.type === "text_delta") {
                  const text = parsed.delta.text as string;
                  turnAssistantText += text;
                  const chunk = JSON.stringify({ choices: [{ delta: { content: text } }] });
                  await writer.write(encoder.encode(`data: ${chunk}\n\n`));
                } else if (block.type === "tool_use" && parsed.delta?.type === "input_json_delta") {
                  block.input_json = (block.input_json ?? "") + (parsed.delta.partial_json ?? "");
                }
              } else if (parsed.type === "message_delta") {
                if (parsed.delta?.stop_reason) {
                  stopReason = parsed.delta.stop_reason as string;
                }
              }
              // We intentionally do NOT forward Anthropic 'message_stop' as
              // an OpenAI [DONE] frame here — [DONE] is only emitted once,
              // after the final agentic turn (see below).
            }
          }

          // -------------------------------------------------------------
          // Decide whether to loop again or finalize.
          // -------------------------------------------------------------
          if (stopReason === "tool_use" && !isLastAllowedTurn) {
            // Collect tool_use blocks from this turn in their original
            // block-index order. Anthropic indices are dense within a turn.
            const sortedIndices = Object.keys(blocks)
              .map((k) => parseInt(k, 10))
              .sort((a, b) => a - b);

            // deno-lint-ignore no-explicit-any
            const assistantContent: any[] = [];
            // deno-lint-ignore no-explicit-any
            const toolResults: any[] = [];

            // Always include the text block first if there was any.
            if (turnAssistantText.length > 0) {
              assistantContent.push({ type: "text", text: turnAssistantText });
            }

            for (const idx of sortedIndices) {
              const block = blocks[idx];
              if (block.type !== "tool_use" || !block.tool_use_id || !block.tool_name) {
                continue;
              }
              // Parse the accumulated input JSON. Anthropic guarantees a
              // complete JSON object once the block closes; we just need to
              // tolerate the empty-args case (tool with no inputs).
              let toolInput: Record<string, unknown> = {};
              const raw = block.input_json ?? "";
              if (raw.trim().length > 0) {
                try {
                  toolInput = JSON.parse(raw) as Record<string, unknown>;
                } catch (parseErr) {
                  console.error("Tool input JSON parse failed:", parseErr, raw);
                  toolInput = {};
                }
              }

              assistantContent.push({
                type: "tool_use",
                id: block.tool_use_id,
                name: block.tool_name,
                input: toolInput,
              });

              // Announce tool call to the client BEFORE executing. The
              // payload is just metadata (name + args), no data results.
              const useEvent = JSON.stringify({
                name: block.tool_name,
                args: toolInput,
              });
              await writer.write(
                encoder.encode(`event: tool_use\ndata: ${useEvent}\n\n`),
              );

              // Execute. The dispatcher uses the existing user-JWT-backed
              // supabase client so RLS via SECURITY INVOKER applies.
              const result = await dispatchChildDataTool(
                supabase,
                block.tool_name,
                toolInput,
              );

              const resultEvent = JSON.stringify({
                name: block.tool_name,
                ok: result.ok,
              });
              await writer.write(
                encoder.encode(`event: tool_result\ndata: ${resultEvent}\n\n`),
              );

              // tool_result block is what we send BACK to Claude. We forward
              // the full content (success payload OR error string) — Claude
              // needs to see errors to recover from them.
              const toolResultBlock: Record<string, unknown> = {
                type: "tool_result",
                tool_use_id: block.tool_use_id,
                content: result.content,
              };
              if (result.is_error) {
                toolResultBlock.is_error = true;
              }
              toolResults.push(toolResultBlock);
            }

            if (toolResults.length === 0) {
              // No actionable tool calls collected (shouldn't happen, but
              // bail safely rather than loop forever). Treat this turn as
              // terminal.
              finalAssistantText = turnAssistantText;
              await writer.write(encoder.encode("data: [DONE]\n\n"));
              cleanFinish = true;
              break;
            }

            workingMessages.push({ role: "assistant", content: assistantContent });
            workingMessages.push({ role: "user", content: toolResults });
            // Loop continues. turnAssistantText for tool turns is intentionally
            // discarded for memory-extraction purposes — only the final
            // narrative answer is meaningful.
            continue;
          }

          // Terminal turn — either stop_reason is end_turn / max_tokens /
          // stop_sequence, OR we hit the last allowed turn cap. Emit the
          // single [DONE] sentinel and break out.
          finalAssistantText = turnAssistantText;
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          cleanFinish = true;
          break;
        }
      } catch (err) {
        console.error("Agentic loop error:", err);
        try {
          const errPayload = JSON.stringify({
            error: err instanceof Error ? err.message : "stream error",
          });
          await writer.write(encoder.encode(`event: error\ndata: ${errPayload}\n\n`));
        } catch (_writeErr) {
          // Writer may already be closed; ignore.
        }
      } finally {
        try { await writer.close(); } catch (_) { /* ignore */ }
      }

      // Fire-and-forget memory extraction once the stream is fully drained.
      // Skip when no childId was supplied (no child scope), when the stream
      // didn't complete cleanly, or when nothing was actually generated on
      // the final turn.
      if (
        hasChildScope &&
        cleanFinish &&
        finalAssistantText.trim().length > 0
      ) {
        const transcript = [
          ...(Array.isArray(messages) ? messages : []),
          { role: "assistant", content: finalAssistantText },
        ];
        const promise = fireExtractMemory(jwt, childId as string, transcript, "chat");
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
