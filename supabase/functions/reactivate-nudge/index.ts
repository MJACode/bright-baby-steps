// Reactivation nudge: a gentle in-app note for parents with no feed / sleep /
// diaper log in the last 18 hours.
//
// Run by pg_cron (`reactivate-nudge-3x-daily`, 00:00 / 12:00 / 18:00 UTC).
//
// This function is the ONLY producer of `type = 'reactivation'`
// notifications. check-notifications maps the type to its `reactivation`
// category (for muting and the daily cap) but never inserts it.
//
// Limits (since 2026-10-03; before that the same parent got one row per child
// on every run, i.e. up to 3 per child per day, indefinitely):
//   - at most ONE reactivation notification per parent per 7 days
//     (REACTIVATION_COOLDOWN_DAYS), across all of that parent's children;
//   - skipped when the parent muted the `reactivation` category
//     (profiles.notification_prefs.muted_categories, same field the
//     check-notifications cron honours and the Profile page toggles).
// Any read error inserts nothing: a failed dedupe read must never fall
// through to "nudge everyone".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronKey } from "../_shared/requireCronKey.ts";

const STALE_HOURS = 18;
const REACTIVATION_COOLDOWN_DAYS = 7;

interface StaleRow {
  user_id: string;
  child_id: string;
  child_name: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mutedReactivation(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return false;
  const muted = (prefs as Record<string, unknown>).muted_categories;
  return Array.isArray(muted) && muted.includes("reactivation");
}

serve(async (req) => {
  // pg_cron only. verify_jwt is off for this function (config.toml), so this
  // is the only gate in front of a service-role run.
  const denied = await requireCronKey(req);
  if (denied) return denied;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const now = Date.now();
  const cutoff = new Date(now - STALE_HOURS * 60 * 60 * 1000).toISOString();
  const cooldownSince = new Date(now - REACTIVATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await sb.rpc("users_with_no_logs_since", { since: cutoff });
  if (error) return json({ error: error.message }, 500);

  // One candidate child per parent (first row the RPC returns for them).
  const byParent = new Map<string, StaleRow>();
  for (const row of (stale ?? []) as StaleRow[]) {
    if (!byParent.has(row.user_id)) byParent.set(row.user_id, row);
  }
  if (byParent.size === 0) return json({ inserted: 0, candidates: 0 });

  const parentIds = [...byParent.keys()];

  // Parents already nudged inside the cooldown window.
  const { data: recent, error: recentErr } = await sb
    .from("notifications")
    .select("user_id")
    .eq("type", "reactivation")
    .in("user_id", parentIds)
    .gte("created_at", cooldownSince);
  if (recentErr) return json({ error: recentErr.message }, 500);
  const recentlyNudged = new Set((recent ?? []).map((r: { user_id: string }) => r.user_id));

  // Parents who muted the reactivation category.
  const { data: prefRows, error: prefErr } = await sb
    .from("profiles")
    .select("id, notification_prefs")
    .in("id", parentIds);
  if (prefErr) return json({ error: prefErr.message }, 500);
  const muted = new Set(
    (prefRows ?? [])
      .filter((r: { id: string; notification_prefs: unknown }) => mutedReactivation(r.notification_prefs))
      .map((r: { id: string }) => r.id),
  );

  const rows = [...byParent.values()]
    .filter((row) => !recentlyNudged.has(row.user_id) && !muted.has(row.user_id))
    .map((row) => ({
      user_id: row.user_id,
      child_id: row.child_id,
      message: `Hi again 👋 ${row.child_name}'s log is one tap away whenever you're ready.`,
      type: "reactivation",
    }));

  if (rows.length > 0) {
    const { error: insertError } = await sb.from("notifications").insert(rows);
    if (insertError) return json({ error: insertError.message }, 500);
  }

  return json({
    inserted: rows.length,
    candidates: byParent.size,
    skipped_cooldown: recentlyNudged.size,
    skipped_muted: muted.size,
  });
});
