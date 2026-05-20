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
