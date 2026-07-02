-- Notification preferences (AI-strategy Phase 2 — proactive briefing &
-- restrained nudges).
--
-- Adds `notification_prefs jsonb` to public.profiles. NULLABLE with NO
-- database default — defaults are applied in code (the check-notifications
-- edge function and the frontend prefs UI), so a NULL row or a partial object
-- always resolves to the documented defaults below. Chosen over
-- `DEFAULT '{}'::jsonb` so the client can distinguish "never configured"
-- (NULL) from "explicitly configured" ({} or partial), and so no backfill /
-- table rewrite is needed. The check-notifications restraint layer treats
-- NULL, {}, and missing keys identically.
--
-- Shape (every key optional; unknown keys ignored):
-- {
--   "tz": string,               -- IANA zone, e.g. "America/New_York".
--                               --   Absent/null/invalid => treated as UTC
--                               --   until the client writes one.
--   "quiet_start": "21:00",     -- "HH:MM" 24h, recipient-local. Default 21:00.
--   "quiet_end": "07:00",       -- Default 07:00. Window may cross midnight
--                               --   (start > end). start == end => quiet
--                               --   hours disabled.
--   "muted_categories": [],     -- Subset of: "milestones" | "reminders" |
--                               --   "insights" | "reactivation". Default none.
--                               --   "appointments" is IGNORED if present:
--                               --   appointment reminders are exempt from
--                               --   mutes, quiet hours, and the daily cap
--                               --   (stripped in resolvePrefs — do not offer
--                               --   an appointments mute in the prefs UI).
--                               --   (Category map lives in
--                               --   supabase/functions/check-notifications.)
--   "daily_cap": 3,             -- Max notifications per recipient-local day.
--                               --   Default 3. Appointment reminders are never
--                               --   dropped by the cap (they count toward it,
--                               --   and are the only type allowed to exceed it).
--   "daily_briefing": true      -- Morning daily_briefing nudge on/off.
--                               --   Default true (anything but literal false).
-- }
--
-- RLS: the column rides the existing profiles policies (auth.uid() = id for
-- SELECT/UPDATE — no new policy needed). The check-notifications cron reads
-- other users' prefs via the service-role client, which bypasses RLS by
-- design: it must evaluate PARTNER recipients' prefs when fanning out copies.
--
-- delete_user_account(): no change — this is a column on profiles, which is
-- already the final application-table delete in _purge_user_data().

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb;

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Per-user notification preferences. Nullable; defaults applied in code: '
  '{tz: IANA string (null=UTC), quiet_start: "21:00", quiet_end: "07:00", '
  'muted_categories: [], daily_cap: 3, daily_briefing: true}. Consumed by the '
  'check-notifications edge function (quiet hours, category mutes, daily cap, '
  'morning briefing window).';
