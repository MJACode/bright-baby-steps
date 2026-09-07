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

    // `illness_logs.end_date IS NULL` means "not closed out", which is not the
    // same as "still ill" — parents routinely log the start of a cold and never
    // return to close it. Without a recency bound a single forgotten row pins an
    // AlertTriangle note to Home forever, and that risk is now concentrated:
    // an open illness is the primary surviving trigger for `watch`. 21 days is
    // the outer edge of a normal childhood illness course (most URIs, ear
    // infections and GI bugs resolve in 7-14 days; a lingering cough can run
    // longer), so anything older is far more likely to be a stale row than a
    // live concern. `start_date` is a DATE column, so compare on YYYY-MM-DD.
    const ILLNESS_LOOKBACK_DAYS = 21;
    const illnessSince = new Date(now.getTime() - ILLNESS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

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
        .is("end_date", null)
        .gte("start_date", illnessSince),
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

    // Only categories that actually have entries make it into the context
    // block. Emitting "- Feeds: 0 feeds (types: none)" hands the model a zero
    // to recite as fact in "status"; an absent line is honestly "not recorded",
    // which is what the prompt rules below already tell it to assume.
    const recordedLines: string[] = [];
    if (sleepLogs.length > 0) {
      recordedLines.push(
        `- Sleep: ${totalSleepHrs}h total (${napCount} naps, ${nightCount} night sleeps)`
      );
    }
    if (feedCount > 0) {
      recordedLines.push(`- Feeds: ${feedCount} feeds (types: ${feedTypes.join(", ")})`);
    }
    if (diaperCount > 0) {
      recordedLines.push(`- Diapers: ${diaperCount} total (${wetCount} wet, ${dirtyCount} dirty)`);
    }

    // Nothing logged inside the rolling 48h window. This is NOT the same as
    // "new account" — an established parent who has one quiet weekend lands
    // here too, so the copy has to read correctly to both. It is a
    // forward-looking invitation, never an accusation ("you haven't logged",
    // "nothing recorded"): that framing is exactly what the prompt below
    // forbids the model from using, and it applies to our own copy first.
    const emptyWindowStatus =
      `Log a feed, nap, or diaper and ${core.name}'s briefing will appear here.`;

    // No data → return the fallback without an LLM call.
    if (recordedLines.length === 0) {
      return new Response(
        JSON.stringify({ status: emptyWindowStatus, watch: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let contextBlock = `Child: ${core.name}, ${core.ageString}${core.isPremature ? " (premature)" : ""}.
What the parent recorded in the last 48 hours (this is a log of what they happened to enter, not a full account of the child's day):
${recordedLines.join("\n")}`;

    if (illnesses.length > 0) {
      contextBlock += `\n- Illness started in the last ${ILLNESS_LOOKBACK_DAYS} days and not yet marked resolved: ${illnesses.map((i) => i.illness_name).join(", ")}`;
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

    // Call LLM
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a warm, expert parenting assistant for a baby tracking app. Given the child's data, generate a daily briefing in JSON format with exactly 2 fields:

- "status": A friendly 1-sentence recap of what the PARENT RECORDED in the last 24-48h — a readback of the log, never a verdict on the day (e.g., "You logged 6 feeds and 11h of sleep for Maya.")
- "watch": ONE short sentence naming something the parent can act on today — or null.

When "watch" should be null:
- null is the correct and expected default, not a failure. Most days there is nothing to add, and an absent line reads better than a padded one.
- Return null whenever the honest answer would be a bare observation, a reassurance ("everything looks on track"), a generic tip, or filler.
- Keep "watch" only when it names something the parent can actually do today, or a genuine escalation: an active illness, or an upcoming pediatrician appointment worth preparing for.

What this data can and cannot tell you:
- The summary reflects what the parent happened to record. It is NOT a complete record of the child's day.
- If a category has very few entries, or is absent from the list entirely, treat it as NOT RECORDED — unknown. Never treat it as evidence the behaviour itself was low, short, missing, or declining.
- Never compare a sparse window against a typical or expected baseline. You cannot tell a quiet log from a quiet day.
- Never comment on absent, missing, sparse, or declining logs. Never ask the parent to log more. Never frame a category's absence as a problem, a gap, or something that needs tracking.
- Only categories with entries are listed. A category that is not listed was not recorded — do not mention it, and never write a zero.
- Never grade the day in "status". No "a solid day", "a quiet day", "a busy one", "a light day", "not much today". Say what was logged, attribute it to the parent ("you logged"), and stop.

Rules:
- Use the child's name
- Keep each field to ONE short sentence
- Be warm, direct and supportive — never alarming, never instructional, never scolding
- Write to the parent as "you" and "your baby"; do not use "we"
- Use emojis sparingly (1 per field max)
- If an open illness is listed, that is a valid reason to fill "watch" — mention it once, supportively
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

    // Parse JSON from response (handle possible markdown fences).
    //
    // JSON.parse succeeding does NOT mean we got an object: a bare `null`, an
    // array, a string or a number are all valid JSON. `null` is the live risk —
    // the system prompt tells the model three times that null is the correct
    // default for "watch", which is exactly the pressure that makes a
    // Haiku-class model reply with a bare `null` for the WHOLE response. Reading
    // `.watch` off that throws a TypeError, the outer catch turns it into a 500,
    // and the entire briefing region vanishes from Home. Anything that isn't a
    // plain non-array object is treated as an empty object so the deterministic
    // fallback below runs instead.
    let parsed: { status?: unknown; watch?: unknown } = {};
    try {
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const raw: unknown = JSON.parse(cleaned);
      if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        parsed = raw as { status?: unknown; watch?: unknown };
      } else {
        console.error("LLM returned non-object JSON, using fallback:", cleaned);
      }
    } catch {
      console.error("Failed to parse LLM JSON:", content);
    }

    // Normalize onto the { status, watch } contract before it leaves the
    // function. `watch` is nullable by design, and models asked for a JSON
    // literal null sometimes emit the *string* "null"/"none"/"" instead — which
    // would render as a real line on the client. Rebuilding the object also
    // drops any key the model invents (e.g. a resurrected "focus").
    const watchText = typeof parsed.watch === "string" ? parsed.watch.trim() : "";

    // Deterministic fallback for `status`. Mirrors the framing the prompt asks
    // for: a readback of what the parent recorded, not a claim about the day,
    // and no evaluative adjective. Only categories with entries are named — the
    // old string hardcoded feeds + sleep, so a diapers-only window rendered
    // "had 0 feeds and 0.0h of sleep", which is the same "logging gap presented
    // as a finding about the baby" defect, in the headline and with no model to
    // soften it.
    const recordedParts: string[] = [];
    if (feedCount > 0) {
      recordedParts.push(`${feedCount} ${feedCount === 1 ? "feed" : "feeds"}`);
    }
    if (totalSleepMin > 0) {
      recordedParts.push(`${totalSleepHrs}h of sleep`);
    }
    if (diaperCount > 0) {
      recordedParts.push(
        `${diaperCount} ${diaperCount === 1 ? "diaper change" : "diaper changes"}`
      );
    }
    const recordedList =
      recordedParts.length > 1
        ? `${recordedParts.slice(0, -1).join(", ")} and ${recordedParts[recordedParts.length - 1]}`
        : recordedParts[0] ?? "";
    // recordedParts can still be empty here — the only entry in the window may
    // be an in-progress sleep session with no duration yet. Reuse the same
    // invitation copy as the no-data path so the two never diverge in voice.
    const fallbackStatus = recordedList
      ? `You logged ${recordedList} for ${core.name} over the last 48 hours.`
      : emptyWindowStatus;

    const briefing: { status: string; watch: string | null } = {
      status: typeof parsed.status === "string" && parsed.status.trim()
        ? parsed.status.trim()
        : fallbackStatus,
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
