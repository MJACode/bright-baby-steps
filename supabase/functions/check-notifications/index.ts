import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Check for recent notifications to avoid duplicates (within 3 hours)
    const { data: recentNotifs } = await supabase
      .from("notifications")
      .select("type")
      .eq("user_id", userId)
      .eq("child_id", child.id)
      .gte("created_at", threeHoursAgo);

    const recentTypes = new Set((recentNotifs || []).map((n: { type: string }) => n.type));

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
    // Wind-down is the only block here — it's TZ-safe because it derives from
    // `last_sleep.ended_at + wake_window_low_min` (absolute timestamp + offset).
    // Bedtime cues (HH:MM → wall-clock) need the user's local TZ to fire at
    // the right moment; without a `tz` column on `profiles` or `children`,
    // those would fire 7-8h off for any non-UTC user. The in-app
    // `SleepPlanReminderBanner` covers bedtime cues in local time until that
    // schema lands.
    if (!recentTypes.has("sleep_plan_winddown")) {
      const { data: plan } = await supabase
        .from("sleep_plans")
        .select("wake_window_low_min")
        .eq("child_id", child.id)
        .maybeSingle();

      if (plan && plan.wake_window_low_min) {
        const { data: lastSleep } = await supabase
          .from("sleep_logs")
          .select("ended_at")
          .eq("child_id", child.id)
          .not("ended_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastSleep && lastSleep.ended_at) {
          const lastEnd = new Date(lastSleep.ended_at).getTime();
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

    // Also notify partners
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
