// "Visit Prep" — generates suggested questions for an upcoming pediatrician
// visit, grounded in the child's actual logged data.
//
// Flare+ anchor feature with ONE FREE DRAFT PER VISIT for free users: a
// non-premium caller may generate only when no public.visit_prep_drafts row
// exists for (user_id, child_id, visit_date); after that, 403
// premium_required (same shape as generate-speech-class so the client can
// branch identically). Premium (subscriptions tier='plus', status
// active/trialing) is unlimited.
//
// Non-streaming (called via supabase.functions.invoke) — mirrors
// generate-speech-class, not `chat`. All data pulls use the caller's session
// client (anon key + Authorization header) so RLS applies — no service-role
// key in this function.
//
// Accepted questions are NOT written here: the client inserts them as
// ordinary pediatrician_reminders rows with source='ai_suggested', riding the
// existing include_in_report → PDF path.
//
// verify_jwt: no per-function config exists in this repo (no config.toml
// entries, no deno.json) — siblings rely on the deploy default and enforce
// auth in-code; this function does the same.
//
// Secrets required (already set for sibling functions): ANTHROPIC_API_KEY.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadMemoryContext } from "../_shared/memory.ts";
import { loadChildCore } from "../_shared/childContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  "sleep",
  "feeding",
  "growth",
  "development",
  "illness",
  "general",
] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_QUESTIONS = 6;

// Same fixed-disclaimer approach as generate-speech-class: the exact string is
// pinned in code and stamped onto the response server-side (we also instruct
// the model to include it, but never trust the model's copy).
const DISCLAIMER =
  "General educational information, not medical advice or a diagnosis. These are suggested questions to bring to your pediatrician — they know your child best.";

// Legal review 2026-07-02 (MED, deferred-care risk): always appended to the
// returned disclaimer. Unconditional by design — simpler and safer than
// branching on whether fever/illness data happened to be logged.
const URGENT_NOTE =
  "If your child seems unwell right now — especially any fever in a baby under 3 months — call your pediatrician or seek care promptly rather than waiting for this visit.";

const SYSTEM_PROMPT = `You are a warm, expert parenting assistant for a baby-tracking app, helping a parent prepare for their child's pediatrician visit.

Your ONLY job: suggest questions the PARENT can ASK THE PEDIATRICIAN, grounded in the child's actual logged data provided below.

Return ONLY this JSON object — no prose, no markdown, no code fences:
{
  "questions": [
    { "text": "the question, phrased in the parent's voice, to ask the doctor", "why": "one short sentence tying it to this child's actual data", "category": "sleep" | "feeding" | "growth" | "development" | "illness" | "general" }
  ],
  "disclaimer": "${DISCLAIMER}"
}

Rules:
- At most ${MAX_QUESTIONS} questions. Fewer, well-grounded questions beat filler. Every question must reference something specific in this child's data (a pattern, a number, a recent event) — never generic boilerplate.
- Questions only — NEVER advice, diagnoses, dosing, or treatment suggestions. You are helping the parent ask, not answering for the doctor.
- Warm and celebratory, never alarmist or clinical. Frame observations neutrally ("I noticed...", "Is this typical for her age?") — never imply the child is delayed, behind, or at risk.
- Milestone-related questions are curious check-ins ("She may start... — what should we look for next?"), not concern screening.
- Do NOT duplicate or lightly rephrase anything already on the parent's existing reminder list (provided below) — suggest only new ground.
- Use the child's name. Lead with the most useful questions — parents are tired.
- Cover different categories where the data supports it; skip categories with nothing noteworthy.
- If the data shows an active illness or recent fever-range reading, a question may reference it as a follow-up topic, but never suggest waiting for the visit to address an active concern and never characterize severity.
- Always return the "disclaimer" field exactly as shown above.`;

type ModelQuestion = { text: string; why: string; category: Category };

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

    const body = await req.json().catch(() => null);
    const child_id = body?.child_id;
    const visit_date = body?.visit_date;
    const appointment_id = body?.appointment_id;

    if (typeof child_id !== "string" || child_id.length === 0) {
      return new Response(
        JSON.stringify({ error: "child_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Format AND calendar validity — an impossible date like 2026-13-45 (NaN
    // Date) or 2026-02-31 (JS rollover to March) would otherwise error the
    // date-column eq() filter and the draft INSERT.
    const visitDateMs = typeof visit_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(visit_date)
      ? new Date(`${visit_date}T00:00:00Z`).getTime()
      : NaN;
    if (
      Number.isNaN(visitDateMs) ||
      new Date(visitDateMs).toISOString().slice(0, 10) !== visit_date
    ) {
      return new Response(
        JSON.stringify({ error: "visit_date is required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (appointment_id !== undefined && typeof appointment_id !== "string") {
      return new Response(
        JSON.stringify({ error: "appointment_id must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Entitlement (mirrors generate-speech-class, plus the one-free-draft
    // carve-out). Defense-in-depth: the client gates the second draft too.
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();

    const isPremium =
      sub?.tier === "plus" && (sub?.status === "active" || sub?.status === "trialing");

    if (!isPremium) {
      // Free tier: one draft per (user, child, visit_date). Fail-open on a
      // count error (the convention for every counted-usage gate here) —
      // worst case is one extra free draft, and the error is logged.
      const { count: existingDrafts, error: draftCountError } = await supabase
        .from("visit_prep_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("child_id", child_id)
        .eq("visit_date", visit_date);
      if (draftCountError) {
        console.error("visit-prep-questions: failed to count drafts:", draftCountError);
      }

      if ((existingDrafts ?? 0) > 0) {
        return new Response(
          JSON.stringify({
            error: "premium_required",
            upgradeUrl: "/upgrade",
            message: "You've used your free visit prep for this visit. Unlimited visit prep is a Flare+ feature.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Child (RLS-scoped — also proves the caller can access this child).
    // Shared loader handles the fetch + canonical age string.
    const core = await loadChildCore(supabase, child_id);

    if (!core) {
      return new Response(
        JSON.stringify({ error: "Child not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();

    // ── Last-30-day data pulls, all through the caller's RLS client
    // (mirrors briefing's approach).
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const sinceDate = sinceIso.slice(0, 10);

    const [
      sleepRes,
      feedRes,
      diaperRes,
      tempRes,
      illnessRes,
      growthRes,
      flagRes,
      reminderRes,
      apptRes,
    ] = await Promise.all([
      supabase
        .from("sleep_logs")
        .select("sleep_type, duration_minutes, started_at")
        .eq("child_id", child_id)
        .gte("started_at", sinceIso),
      supabase
        .from("feeding_logs")
        .select("feeding_type, amount_oz, duration_minutes, logged_at")
        .eq("child_id", child_id)
        .gte("logged_at", sinceIso),
      supabase
        .from("diaper_logs")
        .select("diaper_type, logged_at")
        .eq("child_id", child_id)
        .gte("logged_at", sinceIso),
      supabase
        .from("temperature_logs")
        .select("temp_value, unit, taken_at")
        .eq("child_id", child_id)
        .gte("taken_at", sinceIso)
        .order("taken_at", { ascending: false })
        .limit(20),
      // Active illnesses OR anything that started in the window.
      supabase
        .from("illness_logs")
        .select("illness_name, start_date, end_date")
        .eq("child_id", child_id)
        .or(`end_date.is.null,start_date.gte.${sinceDate}`),
      supabase
        .from("weight_logs")
        .select("weight_oz, length_cm, head_circumference_cm, logged_at")
        .eq("child_id", child_id)
        .order("logged_at", { ascending: false })
        .limit(5),
      // Undismissed milestone flags — phrased to the model as neutral
      // check-in topics, never as concerns about this child.
      supabase
        .from("milestone_flags")
        .select("speech(name)")
        .eq("child_id", child_id)
        .is("dismissed_at", null)
        .limit(10),
      // Existing reminders — for dedupe in the prompt.
      supabase
        .from("pediatrician_reminders")
        .select("text")
        .eq("child_id", child_id)
        .limit(50),
      appointment_id
        ? supabase
          .from("scheduled_visits")
          .select("visit_type")
          .eq("id", appointment_id)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const sleepLogs = sleepRes.data || [];
    const feedLogs = feedRes.data || [];
    const diaperLogs = diaperRes.data || [];
    const tempLogs = tempRes.data || [];
    const illnesses = illnessRes.data || [];
    const growth = growthRes.data || [];
    const flags = flagRes.data || [];
    const reminders = reminderRes.data || [];
    const appt = apptRes?.data ?? null;

    // ── 30-day aggregates.
    const totalSleepMin = sleepLogs.reduce(
      (s: number, l: { duration_minutes: number | null }) => s + (l.duration_minutes || 0),
      0,
    );
    const avgSleepHrsPerDay = (totalSleepMin / 60 / 30).toFixed(1);
    const napCount = sleepLogs.filter((s: { sleep_type: string }) => s.sleep_type === "nap").length;
    const nightCount = sleepLogs.filter((s: { sleep_type: string }) => s.sleep_type === "night").length;

    const feedTypes = [
      ...new Set(feedLogs.map((f: { feeding_type: string }) => f.feeding_type)),
    ];
    const avgFeedsPerDay = (feedLogs.length / 30).toFixed(1);
    const avgDiapersPerDay = (diaperLogs.length / 30).toFixed(1);

    const fevers = tempLogs.filter(
      (t: { temp_value: number; unit: string }) =>
        (t.unit === "C" ? t.temp_value >= 38 : t.temp_value >= 100.4),
    );

    const lines: string[] = [
      `Child: ${core.name}, ${core.ageString}${core.isPremature ? " (premature — consider corrected age)" : ""}.`,
      // Legal review 2026-07-02 (LOW, data minimization): doctor_name is
      // deliberately excluded from the Anthropic payload — third-party
      // personal data with near-zero model value, and PrivacyPage § 4 will
      // not disclose it.
      `Pediatrician visit date: ${visit_date}${appt ? ` (${appt.visit_type})` : ""}.`,
      "",
      "Last 30 days of logged data:",
      `- Sleep: ~${avgSleepHrsPerDay}h/day across ${sleepLogs.length} logged sessions (${napCount} naps, ${nightCount} night sleeps)`,
      `- Feeding: ~${avgFeedsPerDay} feeds/day, ${feedLogs.length} total (types: ${feedTypes.join(", ") || "none"})`,
      `- Diapers: ~${avgDiapersPerDay}/day, ${diaperLogs.length} total`,
    ];

    if (tempLogs.length > 0) {
      lines.push(
        `- Temperature checks: ${tempLogs.length} in the window, ${fevers.length} fever-range reading(s) (most recent: ${tempLogs[0].temp_value}°${tempLogs[0].unit} on ${String(tempLogs[0].taken_at).slice(0, 10)})`,
      );
    }
    if (illnesses.length > 0) {
      lines.push(
        `- Illness: ${illnesses.map((i: { illness_name: string; start_date: string; end_date: string | null }) => `${i.illness_name} (started ${i.start_date}${i.end_date ? `, ended ${i.end_date}` : ", ongoing"})`).join("; ")}`,
      );
    }
    if (growth.length > 0) {
      lines.push(
        `- Growth measurements (newest first): ${growth.map((g: { weight_oz: number | null; length_cm: number | null; head_circumference_cm: number | null; logged_at: string }) => {
          const parts: string[] = [];
          if (g.weight_oz != null) parts.push(`${(g.weight_oz / 16).toFixed(1)} lb`);
          if (g.length_cm != null) parts.push(`${g.length_cm} cm long`);
          if (g.head_circumference_cm != null) parts.push(`head ${g.head_circumference_cm} cm`);
          return `${String(g.logged_at).slice(0, 10)}: ${parts.join(", ") || "n/a"}`;
        }).join(" | ")}`,
      );
    }
    if (flags.length > 0) {
      lines.push(
        `- Milestones the parent may want to check in about (neutral topics, NOT concerns): ${flags.map((f: { speech: { name: string } | null }) => f.speech?.name).filter(Boolean).join(", ")}`,
      );
    }
    lines.push(
      "",
      reminders.length > 0
        ? `Questions/reminders already on the parent's list (do NOT duplicate): ${reminders.map((r: { text: string }) => `"${r.text}"`).join("; ")}`
        : "The parent's reminder list is currently empty.",
    );

    const contextBlock = lines.join("\n");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Per-child memory as a separate non-cached system block; the static
    // system prompt keeps its cache_control prefix stable (same pattern as
    // briefing).
    const memoryBlock = await loadMemoryContext(supabase, child_id);
    const systemContent: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ];
    if (memoryBlock) {
      systemContent.push({ type: "text", text: memoryBlock });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemContent,
        messages: [{ role: "user", content: contextBlock }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("visit-prep-questions Anthropic error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Visit prep is temporarily unavailable." }),
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
      console.error("visit-prep-questions: model returned non-JSON:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't build your visit prep. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Defensive validation: keep only well-formed questions, clamp the
    // category to the fixed set, cap at MAX_QUESTIONS, and stamp the
    // disclaimer from code (never trust the model's copy).
    const rawQuestions = (parsed as { questions?: unknown })?.questions;
    const questions: ModelQuestion[] = (Array.isArray(rawQuestions) ? rawQuestions : [])
      .filter(
        (q: unknown): q is { text: string; why?: unknown; category?: unknown } =>
          !!q && typeof (q as { text?: unknown }).text === "string" &&
          ((q as { text: string }).text.trim().length > 0),
      )
      .slice(0, MAX_QUESTIONS)
      .map((q) => ({
        text: q.text.trim(),
        why: typeof q.why === "string" ? q.why.trim() : "",
        category: CATEGORIES.includes(q.category as Category)
          ? (q.category as Category)
          : "general",
      }));

    if (questions.length === 0) {
      console.error("visit-prep-questions: no valid questions in model output:", cleaned);
      return new Response(
        JSON.stringify({ error: "Couldn't build your visit prep. Try again?" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record one draft row per successful generation (this is the free-tier
    // counter). Awaited, not fire-and-forget — see lessons-backend
    // 2026-05-16. A failed insert only loosens the one-free-draft gate by one
    // request, so it must not fail the response.
    const { error: draftError } = await supabase
      .from("visit_prep_drafts")
      .insert({ user_id: userId, child_id, visit_date });
    if (draftError) {
      console.error("visit-prep-questions: failed to record draft:", draftError);
    }

    return new Response(JSON.stringify({ questions, disclaimer: `${DISCLAIMER} ${URGENT_NOTE}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("visit-prep-questions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
