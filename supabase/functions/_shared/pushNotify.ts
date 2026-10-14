// Push fan-out for rows just inserted into public.notifications.
//
// Pure (deps injected), no remote imports: unit-tested from
// src/test/pushNotify.server.test.ts. check-notifications wires the two DB
// lambdas with its service-role client.
//
// LOCK-SCREEN RULE: a push is readable by anyone holding the phone, so push
// copy NEVER contains the child's name, and never names a health detail
// (allergen, sleep pattern, appointment kind). The in-app row keeps its full
// personalised `message`; the push gets the fixed, generic copy below, keyed
// by type. Unknown types fall back to a fully generic alert rather than
// leaking a message we haven't reviewed. Rationale per type is next to each
// entry.

import type { ApnsEnvironment, ApnsPayload, ApnsResult } from "./apns.ts";

export type PushCopy = { title: string; body: string; route: string };

// Routes must exist in src/App.tsx. The app reads the top-level `route` key on
// tap; it falls back to its own type map only when `route` is missing.
export const PUSH_COPY: Record<string, PushCopy> = {
  // In-app: "Time for a diaper check? Tap to log {name}'s latest"
  diaper_reminder: { title: "Diaper check", body: "Tap to log the latest change.", route: "/dashboard/diapers" },
  // In-app: "How's {name} sleeping today? ..."
  sleep_reminder: { title: "Sleep log", body: "Tap to log a nap or bedtime.", route: "/dashboard/sleep" },
  // In-app: "{name} turns N months old tomorrow!" Name + age dropped.
  milestone_age: {
    title: "A new month starts tomorrow",
    body: "See what milestones are coming up.",
    route: "/dashboard/milestones",
  },
  // In-app: "This week with {name}: ..."
  weekly_development: {
    title: "This week's development update",
    body: "See what to expect this week.",
    route: "/dashboard/milestones",
  },
  // In-app: "{name}'s appointment is tomorrow / in a week". A named child's
  // medical appointment is health detail; "an appointment" without who/when
  // is not. Covers both the 1-day and 7-day cues.
  appointment_reminder: {
    title: "Appointment coming up",
    body: "Tap to review your Visit Prep questions.",
    route: "/dashboard/calendar",
  },
  // In-app: "Wind-down for {name}'s nap in ~N min"
  sleep_plan_winddown: { title: "Nap wind-down", body: "Wind-down time is coming up.", route: "/dashboard/sleep" },
  // In-app: "{name}'s nap window opens in ~N min"
  sleep_window_15min: { title: "Nap window soon", body: "The next nap window opens shortly.", route: "/dashboard/sleep" },
  // In-app: "{name} may be ready for sleep — ..."
  sleep_window_exceeded: {
    title: "Ready for sleep?",
    body: "A contact nap or calm wind-down works well now.",
    route: "/dashboard/sleep",
  },
  // In-app: "{off-plan pattern} for {name} — ...". The pattern ("Short naps
  // today", "Bedtime's been trending later") is the child's sleep data: dropped.
  sleep_off_plan: { title: "A sleep tip", body: "There's a tip in Sleep when you're ready.", route: "/dashboard/sleep" },
  // In-app: "Time for another taste of {allergens}. ... on {name}'s menu."
  // Allergen names are food-allergy health detail: dropped.
  allergen_maintenance: {
    title: "Keep it on the menu",
    body: "Time for another regular serving. Tap to see which foods.",
    route: "/dashboard/feeding",
  },
  // Finance one-shots: no health detail, but the name still goes.
  finance_trump_claim: {
    title: "Trump Account deposit",
    body: "Your child may qualify for a $1,000 Treasury deposit. See how in Finance.",
    route: "/dashboard/financial",
  },
  finance_529_newborn: {
    title: "Saving for school",
    body: "A 529 is one way to save. See how it works in Finance.",
    route: "/dashboard/financial",
  },
  finance_529_birthday: {
    title: "First birthday",
    body: "If family asks what to give, a 529 gift is one option. See how in Finance.",
    route: "/dashboard/financial",
  },
};

export const GENERIC_PUSH_COPY: PushCopy = {
  title: "Grace Flare",
  body: "You have a new notification.",
  route: "/dashboard",
};

export function pushCopyFor(type: string): PushCopy {
  return Object.prototype.hasOwnProperty.call(PUSH_COPY, type) ? PUSH_COPY[type] : GENERIC_PUSH_COPY;
}

export type InsertedNotification = {
  id: string;
  user_id: string;
  child_id: string | null;
  type: string;
};

export type PushDevice = { user_id: string; token: string; environment: ApnsEnvironment };

export function buildPushPayload(n: InsertedNotification): ApnsPayload {
  const copy = pushCopyFor(n.type);
  return {
    aps: { alert: { title: copy.title, body: copy.body }, sound: "default" },
    notification_id: n.id,
    type: n.type,
    route: copy.route,
    // Opaque id (never shown) so the app can switch to the right child.
    child_id: n.child_id,
  };
}

export type PushFanoutDeps = {
  /** False when APNs secrets are missing: skip everything, including DB reads. */
  enabled: boolean;
  pushEnabled: (userId: string) => boolean;
  /** Called with at most 200 ids per call (PostgREST URL length). */
  loadDevices: (userIds: string[]) => Promise<PushDevice[]>;
  pruneTokens: (tokens: string[]) => Promise<void>;
  send: (token: string, environment: ApnsEnvironment, payload: ApnsPayload) => Promise<ApnsResult>;
  concurrency?: number;
};

export type PushFanoutStats = {
  sent: number;
  pruned: number;
  failed: number;
  /** Recipients skipped because push_enabled is false. */
  optedOut: number;
  disabled: boolean;
};

/**
 * One push per (inserted notification x recipient device). Never throws:
 * a push failure must not fail the cron run, the in-app rows already landed.
 */
export async function fanOutPushes(
  rows: InsertedNotification[],
  deps: PushFanoutDeps,
): Promise<PushFanoutStats> {
  const stats: PushFanoutStats = { sent: 0, pruned: 0, failed: 0, optedOut: 0, disabled: !deps.enabled };
  if (!deps.enabled || rows.length === 0) return stats;

  const optedOutUsers = new Set<string>();
  const wanted = rows.filter((r) => {
    if (deps.pushEnabled(r.user_id)) return true;
    optedOutUsers.add(r.user_id);
    return false;
  });
  stats.optedOut = optedOutUsers.size;
  if (wanted.length === 0) return stats;

  const userIds = [...new Set(wanted.map((r) => r.user_id))];
  const devicesByUser = new Map<string, PushDevice[]>();
  try {
    for (let i = 0; i < userIds.length; i += 200) {
      for (const d of await deps.loadDevices(userIds.slice(i, i + 200))) {
        const list = devicesByUser.get(d.user_id) ?? [];
        list.push(d);
        devicesByUser.set(d.user_id, list);
      }
    }
  } catch {
    // Device read failed: no pushes this tick. Count every intended send as failed.
    stats.failed = wanted.length;
    return stats;
  }

  const jobs: Array<{ device: PushDevice; payload: ApnsPayload }> = [];
  for (const row of wanted) {
    const payload = buildPushPayload(row);
    for (const device of devicesByUser.get(row.user_id) ?? []) jobs.push({ device, payload });
  }

  const dead = new Set<string>();
  const size = Math.max(1, deps.concurrency ?? 10);
  for (let i = 0; i < jobs.length; i += size) {
    const batch = jobs.slice(i, i + size).filter((j) => !dead.has(j.device.token));
    const results = await Promise.allSettled(
      batch.map((j) => deps.send(j.device.token, j.device.environment, j.payload)),
    );
    results.forEach((r, k) => {
      if (r.status === "rejected") {
        stats.failed++;
        return;
      }
      switch (r.value.status) {
        case "sent":
          stats.sent++;
          break;
        case "prune":
          dead.add(batch[k].device.token);
          break;
        case "disabled":
          stats.disabled = true;
          break;
        default:
          stats.failed++;
      }
    });
  }

  if (dead.size > 0) {
    try {
      await deps.pruneTokens([...dead]);
      stats.pruned = dead.size;
    } catch {
      // Left in place; the next tick gets the same 410 and retries the prune.
    }
  }
  return stats;
}
