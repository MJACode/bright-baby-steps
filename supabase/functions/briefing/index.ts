import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

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

    // Fetch child info
    const { data: child } = await supabase
      .from("children")
      .select("name, date_of_birth, is_premature, due_date, next_appointment")
      .eq("id", childId)
      .single();

    if (!child) {
      return new Response(JSON.stringify({ error: "Child not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate age
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

    let contextBlock = `Child: ${child.name}, ${ageStr}${child.is_premature ? " (premature)" : ""}.
Last 48 hours summary:
- Sleep: ${totalSleepHrs}h total (${napCount} naps, ${nightCount} night sleeps)
- Feeds: ${feedCount} feeds (types: ${feedTypes.join(", ") || "none"})
- Diapers: ${diaperCount} total (${wetCount} wet, ${dirtyCount} dirty)`;

    if (illnesses.length > 0) {
      contextBlock += `\n- Active illnesses: ${illnesses.map((i) => i.illness_name).join(", ")}`;
    }

    if (child.next_appointment) {
      const apptDate = new Date(child.next_appointment + "T00:00:00");
      const daysUntil = Math.floor((apptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0 && daysUntil <= 7) {
        contextBlock += `\n- Pediatrician appointment in ${daysUntil} days`;
      }
    }

    // No data → return fallback without LLM call
    if (feedCount === 0 && sleepLogs.length === 0 && diaperCount === 0) {
      return new Response(
        JSON.stringify({
          status: `Welcome! Start logging ${child.name}'s activities to get personalized insights here.`,
          watch: "Log feeds, sleep, and diapers to unlock pattern detection.",
          focus: ageMonths < 3
            ? "At this age, skin-to-skin and tummy time are great activities to try."
            : ageMonths < 6
            ? "This is a great age for interactive play and sensory exploration."
            : "Keep encouraging new foods and active play!",
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

    const systemPrompt = `You are a warm, expert parenting assistant for a baby tracking app. Given the child's data, generate a daily briefing in JSON format with exactly 3 fields:

- "status": A friendly 1-sentence summary of the last 24-48h (e.g., "Maya had 6 feeds and 11h of sleep — a solid day!")
- "watch": A 1-sentence observation about patterns to watch (e.g., "Her last nap was shorter than usual — watch for overtiredness signs"). If everything looks normal, say something reassuring.
- "focus": A 1-sentence age-appropriate developmental tip or activity suggestion (e.g., "At 14 weeks, tummy time helps build neck and core strength")

Rules:
- Use the child's name
- Keep each field to ONE short sentence
- Be warm, supportive, never alarming
- Use emojis sparingly (1 per field max)
- Return ONLY valid JSON, no markdown, no code fences
- If an illness is active, mention it in the watch field`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
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
    let briefing;
    try {
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      briefing = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse LLM JSON:", content);
      briefing = {
        status: `${child.name} had ${feedCount} feeds and ${totalSleepHrs}h of sleep in the last 48 hours.`,
        watch: "Everything looks on track — keep up the great work! 💛",
        focus: "Try to maintain consistent routines today.",
      };
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
