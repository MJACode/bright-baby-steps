import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Helpers (shared across all sleep-plan notification types) ---------------

type SleepLogRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  sleep_type: string | null;
};

type SleepPlanRow = {
  wake_window_low_min: number | null;
  wake_window_high_min: number | null;
  bedtime_latest: string | null;
  method: string | null;
};

/**
 * Server-side replication of src/lib/sleepOffPlan.ts. Priority:
 *   window_blown > false_start > short_nap_streak > bedtime_drift
 * Mirrors the thresholds in plan Section 3. Returns null when nothing fires.
 */
function detectOffPlan(
  logs: SleepLogRow[],
  plan: SleepPlanRow,
  now: Date,
): { kind: string; title: string } | null {
  if (!logs || logs.length === 0) return null;

  const sorted = [...logs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  // 1. window_blown — last sleep ended more than (wake_window_high + 30) min ago
  // and no new sleep has started since.
  const finished = sorted.filter((l) => l.ended_at);
  if (finished.length > 0 && plan.wake_window_high_min) {
    const last = finished[0];
    const lastEnd = new Date(last.ended_at as string).getTime();
    const thresholdMs = lastEnd + (plan.wake_window_high_min + 30) * 60_000;
    const newer = sorted.find(
      (l) => new Date(l.started_at).getTime() > lastEnd,
    );
    if (now.getTime() > thresholdMs && !newer) {
      return { kind: "window_blown", title: "Wake window exceeded" };
    }
  }

  // 2. false_start — most recent NIGHT sleep ended within 60 min of starting
  // AND another night sleep started within 30 min of that wake.
  const nights = sorted.filter((l) => l.sleep_type === "night");
  if (nights.length >= 2) {
    const mostRecent = nights[0];
    if (mostRecent.ended_at) {
      const start = new Date(mostRecent.started_at).getTime();
      const end = new Date(mostRecent.ended_at).getTime();
      if (end - start < 60 * 60_000) {
        const followup = nights.find((n) => {
          const s = new Date(n.started_at).getTime();
          return s > end && s - end < 30 * 60_000;
        });
        if (followup) {
          return { kind: "false_start", title: "False start at bedtime" };
        }
      }
    }
  }

  // 3. short_nap_streak — 2 most recent naps both < 45 min.
  const naps = sorted.filter(
    (l) => l.sleep_type === "nap" && l.ended_at,
  );
  if (naps.length >= 2) {
    const durations = naps.slice(0, 2).map((n) => {
      const s = new Date(n.started_at).getTime();
      const e = new Date(n.ended_at as string).getTime();
      return (e - s) / 60_000;
    });
    if (durations[0] < 45 && durations[1] < 45) {
      return { kind: "short_nap_streak", title: "Two short naps in a row" };
    }
  }

  // 4. bedtime_drift — 3-night rolling avg start_at vs bedtime_latest > 30 min.
  if (plan.bedtime_latest && nights.length >= 3) {
    const [hStr, mStr] = plan.bedtime_latest.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const driftsMin: number[] = [];
      for (const n of nights.slice(0, 3)) {
        const startDate = new Date(n.started_at);
        const target = new Date(startDate);
        target.setHours(h, m, 0, 0);
        // If the actual start is before noon, compare to the prior day's
        // bedtime_latest (parent fell asleep across midnight).
        if (startDate.getHours() < 12) {
          target.setDate(target.getDate() - 1);
        }
        driftsMin.push((startDate.getTime() - target.getTime()) / 60_000);
      }
      const avg = driftsMin.reduce((a, b) => a + b, 0) / driftsMin.length;
      if (avg > 30) {
        return { kind: "bedtime_drift", title: "Bedtime drifting later" };
      }
    }
  }

  return null;
}

// --- Phase 2: notification preferences, quiet hours, daily cap ----------------
//
// Every recipient's `profiles.notification_prefs` (jsonb, nullable — see
// migration 20260715000000_notification_preferences.sql) is resolved through
// resolvePrefs() so NULL / {} / partial objects all get the same defaults:
// quiet 21:00–07:00, cap 3/day, daily_briefing on, no mutes, tz UTC.

type NotificationPrefs = {
  tz: string | null;
  quiet_start: string; // "HH:MM" recipient-local
  quiet_end: string;
  muted_categories: string[];
  daily_cap: number;
  daily_briefing: boolean;
};

/**
 * Type → category map. CONTRACT: every notification type inserted into
 * public.notifications must appear here. Categories are the unit of muting
 * (prefs.muted_categories) and must stay in sync with the frontend prefs UI:
 *
 *   appointments — appointment_reminder (cron: next_appointment + scheduled_visits)
 *   milestones   — milestone_age, weekly_development
 *   reminders    — diaper_reminder, sleep_reminder, sleep_plan_winddown,
 *                  sleep_window_15min, sleep_window_exceeded, sleep_off_plan
 *   insights     — daily_briefing (deterministic morning nudge, this function)
 *   reactivation — reactivation (created by reactivate-nudge/index.ts, not
 *                  here; listed so the category contract is complete and its
 *                  rows count toward the daily cap via the existing-today count)
 *
 * Unknown/future types default to "reminders" (see categoryOf) so a new type
 * added without a map entry is still mutable/cappable rather than unfiltered.
 */
const TYPE_CATEGORY: Record<string, string> = {
  appointment_reminder: "appointments",
  milestone_age: "milestones",
  weekly_development: "milestones",
  diaper_reminder: "reminders",
  sleep_reminder: "reminders",
  sleep_plan_winddown: "reminders",
  sleep_window_15min: "reminders",
  sleep_window_exceeded: "reminders",
  sleep_off_plan: "reminders",
  daily_briefing: "insights",
  reactivation: "reactivation",
};

function categoryOf(type: string): string {
  return TYPE_CATEGORY[type] ?? "reminders";
}

/**
 * Daily-cap keep-priority. Lower keeps first when over cap:
 *   0 — appointment reminders (NEVER dropped by the cap; they count toward it
 *       and are the only type allowed to exceed it)
 *   1 — time-sensitive sleep-plan nudges (stale in minutes, worthless later)
 *   2 — everything else (daily_briefing, milestone_age, weekly_development,
 *       diaper_reminder, sleep_reminder, unknown future types)
 */
function capPriority(type: string): number {
  if (type === "appointment_reminder") return 0;
  if (
    type === "sleep_plan_winddown" ||
    type === "sleep_window_15min" ||
    type === "sleep_window_exceeded" ||
    type === "sleep_off_plan"
  ) {
    return 1;
  }
  return 2;
}

/** Defensive parse of the jsonb prefs blob. Never throws; never trusts shape. */
function resolvePrefs(raw: unknown): NotificationPrefs {
  const p = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const cap = typeof p.daily_cap === "number" && Number.isFinite(p.daily_cap) && p.daily_cap >= 0
    ? Math.floor(p.daily_cap)
    : 3;
  return {
    tz: typeof p.tz === "string" && p.tz.length > 0 ? p.tz : null,
    quiet_start: typeof p.quiet_start === "string" ? p.quiet_start : "21:00",
    quiet_end: typeof p.quiet_end === "string" ? p.quiet_end : "07:00",
    muted_categories: Array.isArray(p.muted_categories)
      ? p.muted_categories.filter(
          // "appointments" is stripped here so the appointment_reminder
          // never-dropped contract lives in ONE place. Without this, a
          // hand-written prefs blob muting "appointments" would silently kill
          // appointment cues — and since scheduled_visits stamps
          // reminder_*_sent_at when the cue is queued, a muted-away reminder
          // would be lost forever, not retried. Appointments are exempt from
          // mutes, quiet hours, and the cap alike.
          (c): c is string => typeof c === "string" && c !== "appointments",
        )
      : [],
    daily_cap: cap,
    daily_briefing: p.daily_briefing !== false, // default true; only literal false disables
  };
}

// Invalid IANA names (user typos, stale zones) must not throw inside the cron —
// fall back to UTC. Cache validity checks; the loop calls this a lot.
const tzValidity = new Map<string, boolean>();
function safeTz(tz: string | null): string {
  if (!tz) return "UTC";
  let ok = tzValidity.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    tzValidity.set(tz, ok);
  }
  return ok ? tz : "UTC";
}

/**
 * Recipient-local wall clock for `date` in `tz` (UTC fallback):
 *   minutes — minutes since local midnight (0..1439), via hourCycle h23 so
 *             midnight is 0, never 24*60
 *   dateKey — local calendar date "YYYY-MM-DD"; the unit of "today" for the
 *             daily cap and the one-briefing-per-day guard
 */
function localParts(date: Date, tz: string | null): { minutes: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function parseHHMM(s: string, fallbackMinutes: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return fallbackMinutes;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return fallbackMinutes;
  return h * 60 + mi;
}

/**
 * Quiet-hours test. start == end => disabled. start > end => window crosses
 * midnight (default 21:00–07:00: quiet from 21:00 through 06:59, so a 07:00
 * tick is NOT quiet). Boundaries: [start, end).
 */
function inQuietHours(minutesOfDay: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  if (startMin < endMin) return minutesOfDay >= startMin && minutesOfDay < endMin;
  return minutesOfDay >= startMin || minutesOfDay < endMin;
}

function formatSleepDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();

  // Get all children with their parent IDs
  const { data: children } = await supabase
    .from("children")
    .select("id, name, parent_id, date_of_birth, next_appointment")
    .is("archived_at", null);

  if (!children || children.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notifications: Array<{ user_id: string; child_id: string; message: string; type: string }> = [];

  // owner user_id -> active partner user_ids. Filled by the per-child partner
  // fan-out below; reused by the Phase 2 briefing + restraint layer so we
  // don't re-query partner_access.
  const partnersByOwner = new Map<string, string[]>();

  for (const child of children) {
    const userId = child.parent_id;
    const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    // Widest dedupe window we need below is 24h (sleep_off_plan). Pull once.
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Check for recent notifications to avoid duplicates. The original loop
    // used a single 3-hour window for all types. The new sleep-plan types
    // need finer-grained dedupes (30 min / 90 min / 24h), so we pull the
    // full 24h window once and compare per-type with explicit cutoffs.
    const { data: recentNotifs } = await supabase
      .from("notifications")
      .select("type, created_at")
      .eq("user_id", userId)
      .eq("child_id", child.id)
      .gte("created_at", twentyFourHoursAgo);

    const recent = (recentNotifs || []) as Array<{ type: string; created_at: string }>;
    const recentTypes = new Set(
      recent
        .filter((n) => n.created_at >= threeHoursAgo)
        .map((n) => n.type),
    );
    const lastSentAt = (type: string): number | null => {
      let max: number | null = null;
      for (const n of recent) {
        if (n.type !== type) continue;
        const t = new Date(n.created_at).getTime();
        if (max === null || t > max) max = t;
      }
      return max;
    };

    // 1. No diaper log in 8+ hours
    if (!recentTypes.has("diaper_reminder")) {
      const { data: recentDiaper } = await supabase
        .from("diaper_logs")
        .select("id")
        .eq("child_id", child.id)
        .gte("logged_at", eightHoursAgo)
        .limit(1);

      if (!recentDiaper || recentDiaper.length === 0) {
        // Check if there's ever been a diaper log (avoid nudging brand new users)
        const { data: anyDiaper } = await supabase
          .from("diaper_logs")
          .select("id")
          .eq("child_id", child.id)
          .limit(1);

        if (anyDiaper && anyDiaper.length > 0) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `No diaper logged for ${child.name} in the last 8 hours — time for a check? 🧷`,
            type: "diaper_reminder",
          });
        }
      }
    }

    // 2. No sleep log in 12+ hours
    if (!recentTypes.has("sleep_reminder")) {
      const { data: recentSleep } = await supabase
        .from("sleep_logs")
        .select("id")
        .eq("child_id", child.id)
        .gte("started_at", twelveHoursAgo)
        .limit(1);

      if (!recentSleep || recentSleep.length === 0) {
        const { data: anySleep } = await supabase
          .from("sleep_logs")
          .select("id")
          .eq("child_id", child.id)
          .limit(1);

        if (anySleep && anySleep.length > 0) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `${child.name}'s sleep hasn't been logged in 12+ hours — don't forget to track! 🌙`,
            type: "sleep_reminder",
          });
        }
      }
    }

    // 3. Milestone age coming up (baby turns X months tomorrow)
    if (!recentTypes.has("milestone_age")) {
      const dob = new Date(child.date_of_birth);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const monthsDiff = (tomorrow.getFullYear() - dob.getFullYear()) * 12 + (tomorrow.getMonth() - dob.getMonth());

      if (tomorrow.getDate() === dob.getDate() && monthsDiff > 0 && monthsDiff <= 36) {
        notifications.push({
          user_id: userId,
          child_id: child.id,
          message: `🎂 ${child.name} turns ${monthsDiff} month${monthsDiff > 1 ? "s" : ""} old tomorrow! Check out what milestones are coming up.`,
          type: "milestone_age",
        });
      }
    }

    // 3b. Weekly developmental content nudge (7-day cadence)
    //
    // Warm, non-diagnostic nudge pointing the parent at the Milestones tab
    // for this week's developmental update. The in-app card owns the actual
    // content — this block only fires the nudge.
    //
    // Dedupe is 7 days, which the shared 24h `recent` pull above CANNOT see
    // (it only knows about the last 24h). So we run a dedicated 7-day lookup
    // for an existing `weekly_development` notification and only push when it
    // comes back empty. The 3h `recentTypes` set is not consulted here for the
    // same reason — its window is far narrower than this type's cadence.
    {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const dob = new Date(child.date_of_birth);
      const ageMonths = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());

      // Only nudge for a born child within the 0–24 month content range.
      if (dob <= now && ageMonths >= 0 && ageMonths <= 24) {
        const { data: recentWeekly } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("child_id", child.id)
          .eq("type", "weekly_development")
          .gte("created_at", sevenDaysAgo)
          .limit(1);

        if (!recentWeekly || recentWeekly.length === 0) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `📚 This week with ${child.name}: see what to expect in their development. Tap Milestones for this week's update.`,
            type: "weekly_development",
          });
        }
      }
    }

    // 4. Appointment within 24 hours
    if (!recentTypes.has("appointment_reminder") && child.next_appointment) {
      const apptDate = new Date(child.next_appointment);
      const hoursUntil = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntil > 0 && hoursUntil <= 24) {
        notifications.push({
          user_id: userId,
          child_id: child.id,
          message: `📋 ${child.name}'s appointment is tomorrow! Tap Visit Prep to review your questions.`,
          type: "appointment_reminder",
        });
        // Block #6 (scheduled_visits) checks `recentTypes.has("appointment_reminder")`
        // before pushing its own in-app cue. Without this add(), a user with both
        // `children.next_appointment` set AND a `scheduled_visits` row in the same
        // window would receive two appointment_reminder notifications per tick.
        recentTypes.add("appointment_reminder");
      }
    }

    // 5. Sleep-plan-driven reminders.
    //
    // Five notification types fan out from this block. All share the
    // sleep_plans row + last-sleep-logs read so we fetch each once.
    //
    // Wind-down is the only fully-TZ-safe block — it derives from
    // `last_sleep.ended_at + wake_window_low_min` (absolute timestamp +
    // offset). The new window_15min / window_exceeded types are also TZ-safe
    // for the same reason. sleep_off_plan triggers from log history and
    // wake-window math; bedtime_drift uses plan.bedtime_latest interpreted
    // against the *server's* clock, which is acceptable for v1 (the in-app
    // SleepPlanReminderBanner covers the local-TZ surface).
    const planRes = await supabase
      .from("sleep_plans")
      .select("wake_window_low_min, wake_window_high_min, bedtime_latest, method")
      .eq("child_id", child.id)
      .maybeSingle();
    const plan = planRes.data as SleepPlanRow | null;

    // Pull recent logs once — 10-row limit matches the frontend off-plan
    // detector. Used by wind-down, window_15min, window_exceeded, off_plan.
    let recentLogs: SleepLogRow[] = [];
    if (plan) {
      const logsRes = await supabase
        .from("sleep_logs")
        .select("id, started_at, ended_at, sleep_type")
        .eq("child_id", child.id)
        .order("started_at", { ascending: false })
        .limit(10);
      recentLogs = (logsRes.data || []) as SleepLogRow[];
    }

    const lastFinished = recentLogs.find((l) => l.ended_at) || null;

    // 5a. sleep_plan_winddown — wake-window-aware nap heads-up (existing).
    if (plan && plan.wake_window_low_min && !recentTypes.has("sleep_plan_winddown") && lastFinished) {
      const lastEnd = new Date(lastFinished.ended_at as string).getTime();
      const nextNapOnsetMs = lastEnd + plan.wake_window_low_min * 60 * 1000;
      const cueAtMs = nextNapOnsetMs - 15 * 60 * 1000;
      const minutesAway = Math.round((nextNapOnsetMs - now.getTime()) / 60000);
      const threeHoursMs = 3 * 60 * 60 * 1000;

      if (cueAtMs >= now.getTime() && cueAtMs <= now.getTime() + threeHoursMs && minutesAway > 0) {
        const message = minutesAway <= 15
          ? `Wind-down for ${child.name}'s nap starting now ✨`
          : `Wind-down for ${child.name}'s nap in ~${minutesAway} min ✨`;
        notifications.push({
          user_id: userId,
          child_id: child.id,
          message,
          type: "sleep_plan_winddown",
        });
      }
    }

    // 5b. sleep_window_15min — fires when predicted nap onset is 10-20 min
    // out. Dedupe 30 min: don't re-fire if we sent one in the last 30 min.
    if (plan && plan.wake_window_low_min && lastFinished) {
      const cutoff = now.getTime() - 30 * 60_000;
      const lastSent = lastSentAt("sleep_window_15min");
      if (lastSent === null || lastSent < cutoff) {
        const lastEnd = new Date(lastFinished.ended_at as string).getTime();
        const nextNapOnsetMs = lastEnd + plan.wake_window_low_min * 60 * 1000;
        const minutesAway = (nextNapOnsetMs - now.getTime()) / 60_000;
        if (minutesAway >= 10 && minutesAway <= 20) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `${child.name}'s nap window opens in ~${Math.round(minutesAway)} min`,
            type: "sleep_window_15min",
          });
        }
      }
    }

    // 5c. sleep_window_exceeded — now > ended_at + wake_window_high_min + 30,
    // and no new sleep has started since. Dedupe 90 min.
    if (plan && plan.wake_window_high_min && lastFinished) {
      const cutoff = now.getTime() - 90 * 60_000;
      const lastSent = lastSentAt("sleep_window_exceeded");
      if (lastSent === null || lastSent < cutoff) {
        const lastEnd = new Date(lastFinished.ended_at as string).getTime();
        const thresholdMs = lastEnd + (plan.wake_window_high_min + 30) * 60_000;
        const newer = recentLogs.find(
          (l) => new Date(l.started_at).getTime() > lastEnd,
        );
        if (now.getTime() > thresholdMs && !newer) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `${child.name}'s wake window has been exceeded — try a contact nap`,
            type: "sleep_window_exceeded",
          });
        }
      }
    }

    // 5d. sleep_off_plan — server-side replication of detectOffPlan.
    // Dedupe 24h. The shared recentTypes 3h check would also block this, so
    // we go straight to the 24h lastSentAt check (which is stricter).
    if (plan && recentLogs.length > 0) {
      const lastSent = lastSentAt("sleep_off_plan");
      const cutoff = now.getTime() - 24 * 60 * 60_000;
      if (lastSent === null || lastSent < cutoff) {
        const off = detectOffPlan(recentLogs, plan, now);
        if (off) {
          notifications.push({
            user_id: userId,
            child_id: child.id,
            message: `${off.title} for ${child.name} — open Sleep for guidance`,
            type: "sleep_off_plan",
          });
        }
      }
    }

    // 6. Scheduled-visit reminders (7-day + 1-day).
    //
    // Scans `scheduled_visits` for status='scheduled' rows within the next
    // 8 days for this child. Dedupe is layered:
    //   - DB:  reminder_7d_sent_at / reminder_1d_sent_at stamps (canonical)
    //   - App: the 3h `recentTypes` set prevents same-run double-fires when
    //         the row's scheduled_at sits exactly on a boundary across ticks
    //
    // Email fan-out only goes to the row's parent_id (per the plan's "no
    // partner-routed email in v1" decision). In-app notifications still fan
    // out to partners via the block below — that's the existing convention
    // for every notification type.
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const { data: upcomingVisits } = await supabase
      .from("scheduled_visits")
      .select(
        "id, scheduled_at, visit_type, doctor_name, location, email_reminders_enabled, reminder_7d_sent_at, reminder_1d_sent_at",
      )
      .eq("child_id", child.id)
      .eq("parent_id", userId)
      .eq("status", "scheduled")
      .gt("scheduled_at", now.toISOString())
      .lte("scheduled_at", eightDaysFromNow);

    if (upcomingVisits && upcomingVisits.length > 0) {
      // Email is sent to the row's parent_id — look up once per child loop.
      let parentEmail: string | null = null;
      const needsEmail = upcomingVisits.some((v) => {
        if (!v.email_reminders_enabled) return false;
        const ms = new Date(v.scheduled_at).getTime() - now.getTime();
        const days = ms / (1000 * 60 * 60 * 24);
        if (days <= 1 && !v.reminder_1d_sent_at) return true;
        if (days <= 7 && !v.reminder_7d_sent_at) return true;
        return false;
      });
      if (needsEmail) {
        const { data: userRow } = await supabase.auth.admin.getUserById(userId);
        parentEmail = userRow?.user?.email ?? null;
      }

      for (const visit of upcomingVisits) {
        const ms = new Date(visit.scheduled_at).getTime() - now.getTime();
        const days = ms / (1000 * 60 * 60 * 24);

        // Per-row dispatch flag: tracks whether *this tick* already handled
        // this row (either successfully or with a pending email retry). The
        // 1d branch sets this to prevent the 7d branch from also firing on the
        // same tick, even when we deliberately did NOT stamp because the email
        // failed and we want the next tick to retry. Using a local boolean
        // instead of the DB stamp keeps the "no double-email per tick" guard
        // independent from the "did the email actually land" guard.
        let dispatched = false;

        // 1-day window (also covers anything that slipped past 1d but is still
        // > 0 hours away — better to send late than skip).
        if (days <= 1 && !visit.reminder_1d_sent_at) {
          if (!recentTypes.has("appointment_reminder")) {
            notifications.push({
              user_id: userId,
              child_id: child.id,
              message: `📋 ${child.name}'s appointment is tomorrow! Tap Visit Prep to review your questions.`,
              type: "appointment_reminder",
            });
            recentTypes.add("appointment_reminder");
          }
          // In-app cue is always considered delivered (it's a DB insert at the
          // bottom of this fn). The email is the conditional, retryable side.
          // Order: send email FIRST (if enabled), then stamp only on success;
          // otherwise the next tick re-attempts because the stamp is still NULL.
          let emailOk = true;
          if (visit.email_reminders_enabled && parentEmail) {
            emailOk = false;
            try {
              const resp = await fetch(`${supabaseUrl}/functions/v1/send-visit-reminder-email`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email: parentEmail,
                  child_name: child.name,
                  scheduled_at: visit.scheduled_at,
                  visit_type: visit.visit_type,
                  doctor_name: visit.doctor_name,
                  location: visit.location,
                  days_until: 1,
                }),
              });
              emailOk = resp.ok;
              if (!resp.ok) {
                // Log status only — never raw bodies, child health data may
                // pass through these endpoints (per .claude/rules/api.md).
                console.error("send-visit-reminder-email 1d non-2xx", resp.status, "visit", visit.id);
              }
            } catch (err) {
              const code = err instanceof Error ? err.name : "unknown_error";
              console.error("send-visit-reminder-email 1d fetch failed", code, "visit", visit.id);
            }
          }
          if (emailOk) {
            await supabase
              .from("scheduled_visits")
              .update({ reminder_1d_sent_at: now.toISOString() })
              .eq("id", visit.id);
          }
          dispatched = true;
        }

        // 7-day window (only for rows we haven't 7d-stamped yet, and only if
        // the 1d branch did not already dispatch this tick).
        if (!dispatched && days <= 7 && !visit.reminder_7d_sent_at) {
          if (!recentTypes.has("appointment_reminder")) {
            notifications.push({
              user_id: userId,
              child_id: child.id,
              message: `🗓️ ${child.name}'s appointment is in a week. Tap Visit Prep to start your questions list.`,
              type: "appointment_reminder",
            });
            recentTypes.add("appointment_reminder");
          }
          let emailOk = true;
          if (visit.email_reminders_enabled && parentEmail) {
            emailOk = false;
            try {
              const resp = await fetch(`${supabaseUrl}/functions/v1/send-visit-reminder-email`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  email: parentEmail,
                  child_name: child.name,
                  scheduled_at: visit.scheduled_at,
                  visit_type: visit.visit_type,
                  doctor_name: visit.doctor_name,
                  location: visit.location,
                  days_until: 7,
                }),
              });
              emailOk = resp.ok;
              if (!resp.ok) {
                console.error("send-visit-reminder-email 7d non-2xx", resp.status, "visit", visit.id);
              }
            } catch (err) {
              const code = err instanceof Error ? err.name : "unknown_error";
              console.error("send-visit-reminder-email 7d fetch failed", code, "visit", visit.id);
            }
          }
          if (emailOk) {
            await supabase
              .from("scheduled_visits")
              .update({ reminder_7d_sent_at: now.toISOString() })
              .eq("id", visit.id);
          }
          dispatched = true;
        }
      }
    }

    // Also notify partners — fans out every notif queued for this child in
    // this iteration to each active partner. Mirrors the existing pattern;
    // covers all 5 sleep-plan types plus the legacy 4 and the visit reminders.
    const { data: partners } = await supabase
      .from("partner_access")
      .select("partner_id")
      .eq("owner_id", userId)
      .eq("status", "active");

    if (partners) {
      partnersByOwner.set(userId, partners.map((p: { partner_id: string }) => p.partner_id));
      for (const partner of partners) {
        for (const notif of notifications.filter((n) => n.user_id === userId && n.child_id === child.id)) {
          notifications.push({
            ...notif,
            user_id: partner.partner_id,
          });
        }
      }
    }
  }

  // ===========================================================================
  // Phase 2 — deterministic morning briefing + per-recipient restraint layer.
  //
  // Everything above queues candidates into `notifications` exactly as before
  // (per-type dedupe untouched). From here on we (a) queue the daily_briefing
  // nudge per RECIPIENT (not per child-loop iteration), then (b) run every
  // queued row — primary AND partner copies — through the recipient's own
  // prefs: category mutes, quiet hours, daily cap. Partner copies are judged
  // by the PARTNER's prefs, never the primary's.
  // ===========================================================================

  type QueuedNotif = { user_id: string; child_id: string; message: string; type: string };
  type ChildRow = {
    id: string;
    name: string;
    parent_id: string;
    date_of_birth: string;
    next_appointment: string | null;
  };

  // (a) Household map: recipient -> children their briefing can draw on.
  // Primary parents get their own children; partners get each owner's
  // children (first owner wins if they partner multiple households — one
  // briefing per recipient per day, period).
  const childrenByParent = new Map<string, ChildRow[]>();
  for (const child of children as ChildRow[]) {
    const list = childrenByParent.get(child.parent_id) ?? [];
    list.push(child);
    childrenByParent.set(child.parent_id, list);
  }
  // Deterministic briefing subject: youngest child first (the children query
  // has no ORDER BY, so raw order is arbitrary).
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => b.date_of_birth.localeCompare(a.date_of_birth));
  }
  const briefingChildren = new Map<string, ChildRow[]>(childrenByParent);
  for (const [ownerId, partnerIds] of partnersByOwner) {
    const kids = childrenByParent.get(ownerId);
    if (!kids) continue;
    for (const pid of partnerIds) {
      if (!briefingChildren.has(pid)) briefingChildren.set(pid, kids);
    }
  }

  // (b) Batch-fetch prefs for every recipient this run can touch — one query.
  const recipientIds = new Set<string>([
    ...notifications.map((n) => n.user_id),
    ...briefingChildren.keys(),
  ]);
  const prefsByUser = new Map<string, NotificationPrefs>();
  if (recipientIds.size > 0) {
    const { data: prefRows } = await supabase
      .from("profiles")
      .select("id, notification_prefs")
      .in("id", [...recipientIds]);
    for (const row of (prefRows || []) as Array<{ id: string; notification_prefs: unknown }>) {
      prefsByUser.set(row.id, resolvePrefs(row.notification_prefs));
    }
  }
  // Missing profile row (shouldn't happen) => pure defaults.
  const prefsFor = (uid: string): NotificationPrefs => prefsByUser.get(uid) ?? resolvePrefs(null);

  // (c) Everything created in the last 26h, batched in one query. 26h covers
  // any recipient-local midnight: a local day starts at most 24h before `now`
  // in every IANA zone (max offset UTC+14 still keeps local midnight within
  // the last 24h of UTC `now`); +2h slack for clock skew. Used for BOTH the
  // daily cap ("existing today", recipient-local day) and the
  // one-briefing-per-day guard. Note this counts rows from every producer —
  // including reactivate-nudge's `reactivation` type — so the cap reflects
  // total daily volume, not just this function's output.
  const twentySixHoursAgo = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
  const recentByUser = new Map<string, Array<{ type: string; created_at: string }>>();
  if (recipientIds.size > 0) {
    const { data: rows } = await supabase
      .from("notifications")
      .select("user_id, type, created_at")
      .in("user_id", [...recipientIds])
      .gte("created_at", twentySixHoursAgo);
    for (const r of (rows || []) as Array<{ user_id: string; type: string; created_at: string }>) {
      const list = recentByUser.get(r.user_id) ?? [];
      list.push({ type: r.type, created_at: r.created_at });
      recentByUser.set(r.user_id, list);
    }
  }

  // (d) daily_briefing — deterministic morning nudge. NO LLM call here: the
  // message is built from yesterday's sleep/feed logs; the Anthropic-powered
  // briefing itself is generated on demand when the user opens the dashboard
  // (briefing edge function). Fires when:
  //   - recipient-local time is in [07:00, 12:00) AND outside the recipient's
  //     quiet hours. The window is 5h wide (not the nominal 3h "morning") so
  //     the 3h cron always gets a SECOND tick inside it: if the first eligible
  //     tick is swallowed by quiet hours (e.g. quiet-until 07:30 with a tick
  //     at local 07:00) or by the daily cap, the next tick retries. Quiet
  //     hours are pre-checked HERE — not just in the restraint filter — so a
  //     quiet-suppressed tick doesn't consume the day's only chance. With a
  //     3h-wide gate, quiet overlap made the briefing permanently
  //     undeliverable for those users, silently, every day.
  //   - prefs.daily_briefing !== false
  //   - no daily_briefing already created today (recipient-local day) — this
  //     is also the double-fire guard for the two ticks in the widened window
  // It then flows through the same restraint filter as everything else, so it
  // respects the "insights" category mute (also pre-checked here to skip the
  // data fetch), quiet hours, and counts toward the daily cap.
  const statsCache = new Map<string, { sleep: Array<{ s: number; e: number }>; feeds: number[] }>();
  // 50h window: the earliest instant of a recipient-local "yesterday" is
  // exactly now-48h in UTC terms (offset cancels out); +2h slack.
  const fiftyHoursAgo = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
  const childStats = async (childId: string) => {
    const cached = statsCache.get(childId);
    if (cached) return cached;
    const [sleepRes, feedRes] = await Promise.all([
      supabase
        .from("sleep_logs")
        .select("started_at, ended_at")
        .eq("child_id", childId)
        .not("ended_at", "is", null)
        .gte("ended_at", fiftyHoursAgo),
      supabase
        .from("feeding_logs")
        .select("logged_at")
        .eq("child_id", childId)
        .gte("logged_at", fiftyHoursAgo),
    ]);
    const stats = {
      sleep: ((sleepRes.data || []) as Array<{ started_at: string; ended_at: string }>).map((l) => ({
        s: new Date(l.started_at).getTime(),
        e: new Date(l.ended_at).getTime(),
      })),
      feeds: ((feedRes.data || []) as Array<{ logged_at: string }>).map((f) =>
        new Date(f.logged_at).getTime(),
      ),
    };
    statsCache.set(childId, stats);
    return stats;
  };

  for (const [recipientId, kids] of briefingChildren) {
    const prefs = prefsFor(recipientId);
    if (!prefs.daily_briefing) continue;
    if (prefs.muted_categories.includes("insights")) continue; // filter would drop it; skip the fetch
    const local = localParts(now, prefs.tz);
    if (local.minutes < 7 * 60 || local.minutes >= 12 * 60) continue;
    // Quiet-hours pre-check (mirrors the mute pre-check above): if this tick
    // is quiet for the recipient, skip WITHOUT queueing so a later tick in
    // the [07:00, 12:00) window can deliver instead of the restraint filter
    // burning the attempt.
    if (
      inQuietHours(
        local.minutes,
        parseHHMM(prefs.quiet_start, 21 * 60),
        parseHHMM(prefs.quiet_end, 7 * 60),
      )
    ) {
      continue;
    }
    const alreadyToday = (recentByUser.get(recipientId) || []).some(
      (r) =>
        r.type === "daily_briefing" &&
        localParts(new Date(r.created_at), prefs.tz).dateKey === local.dateKey,
    );
    if (alreadyToday) continue;

    const child = kids[0];
    if (!child) continue;

    const stats = await childStats(child.id);
    const yesterdayKey = localParts(new Date(now.getTime() - 24 * 60 * 60 * 1000), prefs.tz).dateKey;
    let sleepMin = 0;
    for (const log of stats.sleep) {
      if (log.e > log.s && localParts(new Date(log.e), prefs.tz).dateKey === yesterdayKey) {
        sleepMin += (log.e - log.s) / 60_000;
      }
    }
    sleepMin = Math.round(sleepMin);
    const feedCount = stats.feeds.filter(
      (t) => localParts(new Date(t), prefs.tz).dateKey === yesterdayKey,
    ).length;

    // Brand voice: lead with the most important info, no negative framing —
    // a no-data day gets a neutral invite, never "you didn't log".
    const feedPart = `${feedCount} feed${feedCount === 1 ? "" : "s"}`;
    let message: string;
    if (sleepMin > 0 && feedCount > 0) {
      message = `Good morning — ${child.name} slept ${formatSleepDuration(sleepMin)} and had ${feedPart} yesterday. Tap for today's briefing.`;
    } else if (sleepMin > 0) {
      message = `Good morning — ${child.name} slept ${formatSleepDuration(sleepMin)} yesterday. Tap for today's briefing.`;
    } else if (feedCount > 0) {
      message = `Good morning — ${child.name} had ${feedPart} yesterday. Tap for today's briefing.`;
    } else {
      message = `Good morning — today's briefing for ${child.name} is ready. Tap to take a look.`;
    }

    notifications.push({
      user_id: recipientId,
      child_id: child.id,
      message,
      type: "daily_briefing",
    });
  }

  // (e) Restraint filter — mutes, quiet hours, daily cap. Order per recipient:
  //   1. Drop rows whose category is muted (unknown types => "reminders").
  //   2. Quiet hours (recipient-local, window may cross midnight): suppress
  //      everything EXCEPT appointment_reminder.
  //   3. Daily cap: existing-today count (recipient-local day) + this run's
  //      keeps must stay <= daily_cap (default 3). When over, keep by
  //      capPriority (appointments > time-sensitive sleep nudges > the rest,
  //      original queue order within a tier). appointment_reminder is never
  //      dropped — it consumes cap slots first and is the ONLY type that can
  //      push the day's total past the cap.
  // Suppressed rows are simply not inserted; per-type dedupe windows upstream
  // are based on rows that DID insert, so a suppressed nudge may re-qualify on
  // a later tick — intended (e.g. quiet hours ending).
  const byUser = new Map<string, QueuedNotif[]>();
  for (const n of notifications) {
    const list = byUser.get(n.user_id) ?? [];
    list.push(n);
    byUser.set(n.user_id, list);
  }

  const toInsert: QueuedNotif[] = [];
  let suppressed = 0;

  for (const [uid, queued] of byUser) {
    const prefs = prefsFor(uid);
    const muted = new Set(prefs.muted_categories);
    const local = localParts(now, prefs.tz);
    const quiet = inQuietHours(
      local.minutes,
      parseHHMM(prefs.quiet_start, 21 * 60),
      parseHHMM(prefs.quiet_end, 7 * 60),
    );

    let kept = queued.filter((n) => !muted.has(categoryOf(n.type)));
    if (quiet) kept = kept.filter((n) => n.type === "appointment_reminder");
    suppressed += queued.length - kept.length;

    const existingToday = (recentByUser.get(uid) || []).filter(
      (r) => localParts(new Date(r.created_at), prefs.tz).dateKey === local.dateKey,
    ).length;

    // Stable priority order: tier first, then original queue position.
    const ordered = kept
      .map((n, i) => ({ n, i, p: capPriority(n.type) }))
      .sort((a, b) => a.p - b.p || a.i - b.i);

    let used = existingToday;
    for (const { n } of ordered) {
      if (n.type === "appointment_reminder") {
        toInsert.push(n);
        used++;
        continue;
      }
      if (used < prefs.daily_cap) {
        toInsert.push(n);
        used++;
      } else {
        suppressed++;
      }
    }
  }

  // Insert all surviving notifications
  if (toInsert.length > 0) {
    await supabase.from("notifications").insert(toInsert);
  }

  return new Response(JSON.stringify({ processed: toInsert.length, suppressed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
