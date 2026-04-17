import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const { data: { user } } = await supabase.auth.getUser();
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

    // Fetch child
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

    const now = new Date();
    const dob = new Date(child.date_of_birth);
    const ageDays = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
    const ageMonths = Math.floor(ageDays / 30.44);
    const ageStr = ageMonths < 1
      ? `${Math.floor(ageDays / 7)} weeks old`
      : ageMonths < 24
      ? `${ageMonths} months old`
      : `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months old`;

    // Last 7 days
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [sleepRes, feedRes, diaperRes, speechRes, milestonesRes, illnessRes] = await Promise.all([
      supabase
        .from("sleep_logs")
        .select("sleep_type, duration_minutes, started_at, ended_at, quality")
        .eq("child_id", childId)
        .gte("started_at", since),
      supabase
        .from("feeding_logs")
        .select("feeding_type, amount_oz, duration_minutes, logged_at")
        .eq("child_id", childId)
        .gte("logged_at", since),
      supabase
        .from("diaper_logs")
        .select("diaper_type, logged_at")
        .eq("child_id", childId)
        .gte("logged_at", since),
      supabase
        .from("speech_journal")
        .select("word_or_sound, entry_date")
        .eq("child_id", childId)
        .gte("entry_date", since.slice(0, 10)),
      supabase
        .from("child_speech")
        .select("status, achieved_at")
        .eq("child_id", childId)
        .eq("status", "achieved")
        .gte("achieved_at", since.slice(0, 10)),
      supabase
        .from("illness_logs")
        .select("illness_name")
        .eq("child_id", childId)
        .is("end_date", null),
    ]);

    const sleeps = sleepRes.data || [];
    const feeds = feedRes.data || [];
    const diapers = diaperRes.data || [];
    const words = speechRes.data || [];
    const milestones = milestonesRes.data || [];
    const illnesses = illnessRes.data || [];

    // Compute aggregates
    const calcDur = (s: any) => {
      if (s.duration_minutes) return s.duration_minutes;
      if (s.started_at && s.ended_at)
        return Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
      return 0;
    };

    const totalSleepMin = sleeps.reduce((sum, s) => sum + calcDur(s), 0);
    const avgSleepHrs = (totalSleepMin / 7 / 60).toFixed(1);
    const napCount = sleeps.filter(s => s.sleep_type === "nap").length;
    const nightCount = sleeps.filter(s => s.sleep_type === "night").length;

    const feedCount = feeds.length;
    const avgFeedsPerDay = (feedCount / 7).toFixed(1);
    const feedTypes = [...new Set(feeds.map(f => f.feeding_type))];
    const bottleFeeds = feeds.filter(f => f.amount_oz);
    const avgOz = bottleFeeds.length
      ? (bottleFeeds.reduce((s, f) => s + Number(f.amount_oz), 0) / bottleFeeds.length).toFixed(1)
      : null;

    const diaperCount = diapers.length;
    const wetCount = diapers.filter(d => d.diaper_type === "wet").length;
    const dirtyCount = diapers.filter(d => d.diaper_type === "dirty" || d.diaper_type === "both").length;

    const newWords = words.map(w => w.word_or_sound);
    const milestonesAchieved = milestones.length;

    // No data fallback
    if (feedCount === 0 && sleeps.length === 0 && diaperCount === 0) {
      return new Response(JSON.stringify({
        sleep: `Start logging ${child.name}'s sleep to see weekly patterns here.`,
        feeding: "Log feeds throughout the week for a personalized summary.",
        development: "Track words and milestones to see development highlights.",
        tip: ageMonths < 3
          ? "Tip: At this age, aim for lots of skin-to-skin contact and tummy time."
          : "Tip: Keep exploring new activities and routines with your little one!",
        generatedAt: now.toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build context for LLM
    let context = `Child: ${child.name}, ${ageStr}${child.is_premature ? " (premature)" : ""}.
Weekly summary (last 7 days):
- Sleep: ${avgSleepHrs}h/day average, ${totalSleepMin} total minutes, ${napCount} naps, ${nightCount} night sleeps
- Feeding: ${avgFeedsPerDay} feeds/day (${feedCount} total), types: ${feedTypes.join(", ") || "none"}${avgOz ? `, avg bottle: ${avgOz} oz` : ""}
- Diapers: ${diaperCount} total (${wetCount} wet, ${dirtyCount} dirty), avg ${(diaperCount / 7).toFixed(1)}/day
- New words this week: ${newWords.length > 0 ? newWords.join(", ") : "none logged"}
- Milestones achieved this week: ${milestonesAchieved}`;

    if (illnesses.length) {
      context += `\n- Active illnesses: ${illnesses.map(i => i.illness_name).join(", ")}`;
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a warm, expert parenting assistant. Given a baby's weekly data summary, generate a weekly digest in JSON with exactly 4 fields:

- "sleep": 2-3 sentence summary of sleep patterns this week. Mention total hours, trends, and whether it seems age-appropriate.
- "feeding": 2-3 sentence summary of feeding patterns. Note frequency, volume trends if available, and feeding types.
- "development": 2-3 sentences about developmental highlights — new words logged, milestones achieved, and age-appropriate context.
- "tip": One actionable, age-appropriate parenting tip for the coming week.

Rules:
- Use the child's name naturally
- Be warm, supportive, never alarming
- Use emojis sparingly (1-2 per section max)
- Ground observations in the actual numbers provided
- If data is limited in a category, acknowledge it warmly and encourage logging
- Return ONLY valid JSON, no markdown, no code fences`;

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
        messages: [{ role: "user", content: context }],
        temperature: 0.7,
        max_tokens: 600,
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
    const content2 = llmData.content?.[0]?.text || "";

    let digest;
    try {
      const cleaned = content2.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      digest = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse weekly JSON:", content2);
      digest = {
        sleep: `${child.name} logged ${sleeps.length} sleep sessions this week, averaging about ${avgSleepHrs} hours per day.`,
        feeding: `${feedCount} feeds were logged this week across ${feedTypes.join(" and ") || "various"} types.`,
        development: newWords.length
          ? `New words this week: ${newWords.join(", ")}! ${milestonesAchieved} milestones achieved.`
          : `${milestonesAchieved} milestones achieved this week. Keep logging words to track language growth!`,
        tip: "Keep up the great routines — consistency is key at this age! 💛",
      };
    }

    digest.generatedAt = now.toISOString();

    // Include raw stats for the UI
    digest.stats = {
      avgSleepHrs: parseFloat(avgSleepHrs),
      totalFeeds: feedCount,
      avgFeedsPerDay: parseFloat(avgFeedsPerDay),
      totalDiapers: diaperCount,
      newWords: newWords.length,
      milestonesAchieved,
    };

    return new Response(JSON.stringify(digest), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Weekly insights error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
