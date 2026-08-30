# Task — Let a parent set the schedule their data is tracked against

Request: *"Allow user to set schedule to track data. Meaning a user wants to
track 7am to 12pm or something else. Huckleberry does this already — look at
them for competitive. This is important for when to track overall sleep and
other data."*

## What the app did before
Every daily aggregate was pinned to **local midnight**, with no way to change
it:

- `groupLogsByDay` keyed History day headers by `format(at, "yyyy-MM-dd")`.
- `useLogHistory` fetched from `subDays(startOfDay(now), days - 1)`.
- `AnalyticsPage`'s 7-day bars bucketed by calendar date.
- `SleepPage` insights averaged daily sleep by calendar date.
- Nap-vs-night was derived only from the saved sleep plan's `bedtime_earliest`,
  then an age-bracket default (`resolveNightStartMin`) — the family never got a
  say.

So a 3 AM feed opened a brand-new "Today" with one row in it, and the night the
parent was actually living through was split across two day headers.

## Interpretation of "7am to 12pm"
Read as a **day boundary, not a filter**. The tracking day *rotates* — it runs
from the day start to the same clock time the next day — so nothing is ever
dropped: a 3 AM log under a 07:00 day start files under the previous date,
where the parent already thinks it belongs. A literal 7am–12pm window would
discard every night feed, which is the opposite of what a tracking app is for.
Two boundaries are settable, matching Huckleberry's split:

- **Day starts** — anchors totals, day headers, and the 7-day charts.
- **Night starts** — the nap-vs-night line.

## Changes
- [x] `supabase/migrations/20260830000000_child_tracking_schedule.sql` — adds
      nullable `day_start_time` / `night_start_time` (HH:MM text, CHECK-
      constrained) to `public.children`, and surfaces both in
      `get_child_profile()`. **NULL = today's behaviour** (midnight; night from
      the plan/bracket), so no existing family's history silently reshuffles.
      Per-child, not per-account — a newborn and a toddler keep different days.
- [x] `src/lib/trackingDay.ts` — the one place the boundary math lives:
      `trackingDayStart/Date/Key`, `isSameTrackingDay`, `trackingWindowStart`,
      `parseClock`, `formatClock`.
- [x] `src/hooks/useTrackingSchedule.ts` — resolves the active child's schedule
      off the already-cached `["children"]` query (no extra request), memoized
      on the two clock strings so the 30s refetch doesn't re-key downstream
      `useMemo`s.
- [x] `groupLogsByDay` takes a schedule; `GroupedLogList` takes it as a **prop**
      (stays presentational) and anchors `dayLabel` to the current tracking day
      so "Today" still reads Today at 3 AM.
- [x] `useLogHistory` windows from the tracking-day start, keys the cache on
      `dayStartMin`, trims the partial oldest day by tracking day, and hands the
      schedule back so the list groups on the same boundary it fetched.
- [x] `AnalyticsPage` — calendar dots, the 7-day buckets, and all four charts.
      Two keying functions, one key space: a cell/bucket keys by its own date, a
      log keys by the tracking day containing it.
- [x] `SleepPage` insights — 7-day window and daily-average buckets.
- [x] `resolveNightStartMin(plan, bucket, familyNightStartMin?)` — the family's
      setting now beats the plan's bedtime, which beats the bracket default.
      Threaded through `buildSleepTodo`, `useSleepTodo`, and `SleepCoachCard`,
      so a quick-started sleep is typed against the family's own night.
- [x] `src/components/TrackingScheduleSettings.tsx` — Profile & Settings card
      with two `type="time"` inputs (mirrors the quiet-hours pattern), a
      plain-language preview line, a warning when night ≤ day, and a "Back to
      midnight" reset.
- [x] Tests: `src/lib/__tests__/trackingDay.test.ts` (19) plus custom-day-start
      cases in `groupLogsByDay.test.ts`.

## Verification
`npx tsc -p tsconfig.app.json --noEmit` clean · `npm test` 443 passed
(31 files) · `npx eslint` clean on every changed file · `npm run build` ✓.

The migration is written but **not applied to live** — it needs
`supabase db push` or an MCP `apply_migration` before the setting persists in
production. Until then the UI writes to columns that don't exist yet.

## Not done, deliberately
- **The Calendar tab still runs midnight-to-midnight.** `DayTimeline` /
  `WeekTimeline` draw a literal 24-hour clock grid; re-anchoring that is a
  visual redesign (where does the axis start? what does a week column mean?),
  not a boundary swap. Aggregates moved; the timeline grid didn't.
- **`buildSleepTodo`'s internal `dayStart`** stays at calendar midnight. The
  sleep to-do anchors on the observed wake anchor, not the day boundary, and
  its slot-filling logic is covered by a large fixture suite that encodes that
  assumption. The night boundary — the part that actually mislabels data — is
  wired.
- **No default flip.** New and existing children both start at midnight. Making
  07:00 the default would retro-regroup every family's history on upgrade; if
  the product wants Huckleberry's default, that's a one-line change plus a
  migration backfill, and it should be a deliberate call.
