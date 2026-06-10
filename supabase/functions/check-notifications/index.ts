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

  // Insert all notifications
  if (notifications.length > 0) {
    await supabase.from("notifications").insert(notifications);
  }

  return new Response(JSON.stringify({ processed: notifications.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
