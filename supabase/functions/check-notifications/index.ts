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
      }
    }

    // 5. Sleep-plan-driven reminders (wind-down, bedtime, bedtime running late).
    //
    // Cron fires every 3h, so the lookahead window is 3h. Reminder copy itself
    // stays tighter ("starting now" if <= 15 min away, "in ~X min" otherwise).
    //
    // Time-zone caveat: Supabase doesn't know the child's local TZ, so the
    // bedtime HH:MM strings on `sleep_plans` are interpreted as UTC for v1.
    // This is imprecise — a parent in PT logged bedtime as 19:30 (their local)
    // will see the reminder fire 7-8h off. Acceptable for v1; revisit once we
    // add a `tz` column on `profiles` or `children`.
    {
      const { data: plan } = await supabase
        .from("sleep_plans")
        .select(
          "wake_window_low_min, bedtime_earliest, bedtime_latest",
        )
        .eq("child_id", child.id)
        .maybeSingle();

      if (plan) {
        const { data: lastSleep } = await supabase
          .from("sleep_logs")
          .select("started_at, ended_at, sleep_type")
          .eq("child_id", child.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentlySleeping = lastSleep && lastSleep.ended_at === null;
        const threeHoursMs = 3 * 60 * 60 * 1000;

        // 5a. Wind-down for next nap. Skip entirely when the child is already
        //     asleep — no reason to nudge a wind-down while they're down.
        if (
          !currentlySleeping &&
          !recentTypes.has("sleep_plan_winddown") &&
          plan.wake_window_low_min &&
          lastSleep &&
          lastSleep.ended_at
        ) {
          const lastEnd = new Date(lastSleep.ended_at).getTime();
          const nextNapOnsetMs = lastEnd + plan.wake_window_low_min * 60 * 1000;
          // Cue ~15 min before the next nap onset.
          const cueAtMs = nextNapOnsetMs - 15 * 60 * 1000;
          const minutesAway = Math.round((nextNapOnsetMs - now.getTime()) / 60000);

          // Fire when the cue time falls inside [now, now + 3h] AND the nap
          // itself is still in the future (minutesAway > 0).
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

        // For the bedtime checks: has a night sleep already started today (UTC)?
        const startOfDayUtc = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
        ));
        let nightSleepStartedToday = false;
        if (lastSleep && lastSleep.sleep_type === "night") {
          const started = new Date(lastSleep.started_at);
          if (started >= startOfDayUtc) {
            nightSleepStartedToday = true;
          }
        }

        // Helper: parse HH:MM into a UTC Date for today.
        const todayAtUtc = (hhmm: string | null): Date | null => {
          if (!hhmm) return null;
          const [h, m] = hhmm.split(":").map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
          return new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            h,
            m,
          ));
        };

        // 5b. Bedtime within the next 3h, no night sleep started yet today.
        if (
          !nightSleepStartedToday &&
          !recentTypes.has("sleep_plan_bedtime") &&
          plan.bedtime_earliest
        ) {
          const bedtimeTarget = todayAtUtc(plan.bedtime_earliest);
          if (bedtimeTarget) {
            const minutesAway = Math.round((bedtimeTarget.getTime() - now.getTime()) / 60000);
            if (minutesAway > 0 && bedtimeTarget.getTime() <= now.getTime() + threeHoursMs) {
              const message = minutesAway <= 15
                ? `Bedtime starting now — start the wind-down for ${child.name} ✨`
                : `Bedtime in ~${minutesAway} min — start the wind-down for ${child.name} ✨`;
              notifications.push({
                user_id: userId,
                child_id: child.id,
                message,
                type: "sleep_plan_bedtime",
              });
            }
          }
        }

        // 5c. Bedtime running late: now > bedtime_latest + 30min AND no night
        //     sleep started yet today.
        if (
          !nightSleepStartedToday &&
          !recentTypes.has("sleep_plan_bedtime_late") &&
          plan.bedtime_latest
        ) {
          const bedtimeLatest = todayAtUtc(plan.bedtime_latest);
          if (bedtimeLatest) {
            const lateAfter = bedtimeLatest.getTime() + 30 * 60 * 1000;
            if (now.getTime() > lateAfter) {
              notifications.push({
                user_id: userId,
                child_id: child.id,
                message: `Bedtime is running late for ${child.name} — let's start the wind-down ✨`,
                type: "sleep_plan_bedtime_late",
              });
            }
          }
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
