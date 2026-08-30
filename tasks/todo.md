# Task — Home screen quoted two different nap times

Reported from the app: the "Coach predicts" band said **"Likely sleepy around
9:50 AM"** while, on the same screen, the Sleep Coach card said **"Nap around
7:45"** and Next steps said **"Nap window around 7:47 AM"**. Two of the three
agreed; the band was the outlier.

## Root cause
There were **two independent nap-prediction engines**.

- `src/lib/sleepCoach.ts` → `predictNextNap()` is the real one, read by
  `SleepCoachCard` and `useNextSteps` (via `useSleepCoach`). It takes the
  **median** wake window, restricted to samples from the **same daypart** as the
  last wake, discards outliers outside 30–360 min, and suppresses windows that
  open during night hours.
- `NextEventBand` computed its own: the **mean of every sleep-to-sleep gap** in
  the trailing 14 days, with no outlier filter and no daypart bucketing. That
  average folds in the long gaps around **overnight sleep**, which is why the
  band landed ~2 h later than the coach card off the very same "last wake"
  anchor. The "Based on 39 recent wake windows" line was the tell — 39 gaps in
  two weeks is naps *and* nights.

## Changes
- [x] `NextEventBand` now reads `useSleepCoach` for the nap side — the exact
      `windowStart` the coach card renders. It no longer queries `sleep_logs`
      or does any wake-window math of its own.
- [x] Feed side kept (nothing else predicts feeds), moved to
      `src/lib/nextEvent.ts` as pure `predictNextFeed()` + `pickNextEvent()` so
      it is unit-testable. Feed behaviour is unchanged (mean interval).
- [x] The band's "based on" line now shows the coach's own `reason` for a nap
      ("Based on 15 morning naps over the last 2 weeks.") instead of a wake-window
      count that counted nights.
- [x] The band honours `calmMode` like the other two surfaces (`around 7:45`
      via `formatApproxClock`, no minute countdown).
- [x] `NextEventBand` takes `activeChild` instead of `childId` — the nap engine
      needs DOB / prematurity to pick its age defaults. Dashboard updated.
- [x] Added `"sleep-coach"` to `LOG_WRITE_QUERY_KEYS`. It was missing, so after
      logging a sleep the nap prediction stayed stale for up to 5 minutes
      (`refetchInterval`) while everything else on the screen refreshed. Now
      that the band reads the same hook, both nap surfaces refresh on write.
- [x] Kept the band's query-key root as `["next-event", "feed", childId]` —
      react-query prefix-matches element-by-element, so a rename to
      `"next-event-feed"` would have silently dropped it out of that
      invalidation set.
- [x] 10 new tests in `src/test/nextEvent.test.ts`, including a regression case
      built from a fixture with overnight sleeps that asserts the window lands
      ~90 min after the last wake rather than after an overnight-inflated
      average.

## Verification
`npx tsc --noEmit` clean · `npm test` 422 passed (30 files) · eslint clean on
all changed files.

## Review
The fix is a deletion, not an addition: the band had ~50 lines of prediction
math that duplicated — and contradicted — `sleepCoach.ts`. Worth flagging for
whoever adds the next predictive surface: `predictNextNap()` is the only place a
nap time may be computed. `src/lib/nextEvent.ts` carries a header comment saying
so. Anything that needs a nap time reads `useSleepCoach`.

Not done, deliberately: the feed side still uses a **mean** of feed intervals,
which has the same overnight-inflation weakness the nap side just shed (a long
night gap between feeds drags the average late). Nobody reported it and it was
outside this fix — but it is the same defect class, and the next
"why does it say hungry at the wrong time" report is probably this.
