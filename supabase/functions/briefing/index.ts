import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { fireExtractMemory, loadMemoryContext } from "../_shared/memory.ts";
import { humanizeSlug, loadChildCore } from "../_shared/childContext.ts";

// EdgeRuntime.waitUntil is provided by the Supabase Edge runtime but not in
// Deno's lib types.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil: (p: Promise<any>) => void } | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { childId } = await req.json();
    if (!childId) {
      return new Response(JSON.stringify({ error: "childId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Child profile + canonical age via the shared loader (RLS-scoped).
    const core = await loadChildCore(supabase, childId);

    if (!core) {
      return new Response(JSON.stringify({ error: "Child not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();

    // Fetch last 48h of logs
    const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const [sleepRes, feedRes, diaperRes, illnessRes] = await Promise.all([
      supabase
        .from("sleep_logs")
        .select("sleep_type, duration_minutes, started_at")
        .eq("child_id", childId)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      supabase
        .from("feeding_logs")
        .select("feeding_type, amount_oz, duration_minutes, logged_at")
        .eq("child_id", childId)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false }),
      supabase
        .from("diaper_logs")
        .select("diaper_type, logged_at")
        .eq("child_id", childId)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false }),
      supabase
        .from("illness_logs")
        .select("illness_name")
        .eq("child_id", childId)
        .is("end_date", null),
    ]);

    // Build log summary
    const sleepLogs = sleepRes.data || [];
    const feedLogs = feedRes.data || [];
    const diaperLogs = diaperRes.data || [];
    const illnesses = illnessRes.data || [];

    const totalSleepMin = sleepLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const totalSleepHrs = (totalSleepMin / 60).toFixed(1);
    const napCount = sleepLogs.filter((s) => s.sleep_type === "nap").length;
    const nightCount = sleepLogs.filter((s) => s.sleep_type === "night").length;

    const feedCount = feedLogs.length;
    const feedTypes = [...new Set(feedLogs.map((f) => f.feeding_type))];

    const diaperCount = diaperLogs.length;
    const wetCount = diaperLogs.filter((d) => d.diaper_type === "wet").length;
    const dirtyCount = diaperLogs.filter((d) => d.diaper_type === "dirty" || d.diaper_type === "both").length;

    let contextBlock = `Child: ${core.name}, ${core.ageString}${core.isPremature ? " (premature)" : ""}.
Last 48 hours summary:
- Sleep: ${totalSleepHrs}h total (${napCount} naps, ${nightCount} night sleeps)
- Feeds: ${feedCount} feeds (types: ${feedTypes.join(", ") || "none"})
- Diapers: ${diaperCount} total (${wetCount} wet, ${dirtyCount} dirty)`;

    if (illnesses.length > 0) {
      contextBlock += `\n- Active illnesses: ${illnesses.map((i) => i.illness_name).join(", ")}`;
    }

    if (core.nextAppointment) {
      const apptDate = new Date(core.nextAppointment + "T00:00:00");
      const daysUntil = Math.floor((apptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0 && daysUntil <= 7) {
        contextBlock += `\n- Pediatrician appointment in ${daysUntil} days`;
      }
    }

    if (core.interests.length > 0) {
      contextBlock += `\n- Interests: ${core.interests.map(humanizeSlug).join(", ")}`;
    }
    if (core.temperament) {
      contextBlock += `\n- Temperament: ${humanizeSlug(core.temperament)}`;
    }

    // No data → return fallback without LLM call
    if (feedCount === 0 && sleepLogs.length === 0 && diaperCount === 0) {
      return new Response(
        JSON.stringify({
          status: `Welcome! Start logging ${core.name}'s activities to get personalized insights here.`,
          watch: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call LLM
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a warm, expert parenting assistant for a baby tracking app. Given the child's data, generate a daily briefing in JSON format with exactly 2 fields:

- "status": A friendly 1-sentence summary of the last 24-48h (e.g., "Maya had 6 feeds and 11h of sleep — a solid day!")
- "watch": ONE short sentence naming something the parent can act on today — or null.

When "watch" should be null:
- null is the correct and expected default, not a failure. Most days there is nothing to add, and an absent line reads better than a padded one.
- Return null whenever the honest answer would be a bare observation, a reassurance ("everything looks on track"), a generic tip, or filler.
- Keep "watch" only when it names something the parent can actually do today, or a genuine escalation: an active illness, or an upcoming pediatrician appointment worth preparing for.

What this data can and cannot tell you:
- The summary reflects what the parent happened to record. It is NOT a complete record of the child's day.
- If a category has zero or very few entries, treat it as NOT RECORDED — unknown. Never treat it as evidence the behaviour itself was low, short, missing, or declining.
- Never compare a sparse window against a typical or expected baseline. You cannot tell a quiet log from a quiet day.
- Never comment on absent, missing, sparse, or declining logs. Never ask the parent to log more. Never frame a category's absence as a problem, a gap, or something that needs tracking.

Rules:
- Use the child's name
- Keep each field to ONE short sentence
- Be warm, direct and supportive — never alarming, never instructional, never scolding
- Write to the parent as "you" and "your baby"; do not use "we"
- Use emojis sparingly (1 per field max)
- If an illness is active, mention it in the watch field
- Return ONLY valid JSON, no markdown, no code fences. "watch" must be a string or the JSON literal null.`;

    // Per-child memory loaded separately so it can be appended to the
    // system-content array as a non-cached block. The leading system prompt
    // keeps its cache_control prefix unchanged across calls — memory is the
    // mutable bit.
    const memoryBlock = await loadMemoryContext(supabase, childId);
    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ];
    if (memoryBlock) {
      systemContent.push({ type: "text", text: memoryBlock });
    }

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
        messages: [{ role: "user", content: contextBlock }],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("LLM error:", errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const llmData = await response.json();
    const content = llmData.content?.[0]?.text || "";

    // Parse JSON from response (handle possible markdown fences)
    let parsed: { status?: unknown; watch?: unknown } = {};
    try {
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse LLM JSON:", content);
    }

    // Normalize onto the { status, watch } contract before it leaves the
    // function. `watch` is nullable by design, and models asked for a JSON
    // literal null sometimes emit the *string* "null"/"none"/"" instead — which
    // would render as a real line on the client. Rebuilding the object also
    // drops any key the model invents (e.g. a resurrected "focus").
    const watchText = typeof parsed.watch === "string" ? parsed.watch.trim() : "";
    const briefing: { status: string; watch: string | null } = {
      status: typeof parsed.status === "string" && parsed.status.trim()
        ? parsed.status.trim()
        : `${core.name} had ${feedCount} feeds and ${totalSleepHrs}h of sleep in the last 48 hours.`,
      watch: watchText && !/^(null|none|n\/a)\.?$/i.test(watchText) ? watchText : null,
    };

    // Fire-and-forget memory extraction. Build a synthetic transcript that
    // pairs the contextBlock (treated as the user turn — it is what the
    // model saw) with the assistant's parsed briefing as JSON text.
    const jwt = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : authHeader;
    const transcript = [
      { role: "user", content: contextBlock },
      { role: "assistant", content: typeof content === "string" && content.length > 0
        ? content
        : JSON.stringify(briefing) },
    ];
    const extractPromise = fireExtractMemory(jwt, childId, transcript, "briefing");
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(extractPromise);
    } else {
      void extractPromise;
    }

    return new Response(JSON.stringify(briefing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Briefing error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
