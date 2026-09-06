# Hunger indicators on Home + Feed screen

Goal: tell the parent when the baby might be hungry, mirroring how Sleep Coach
tells them when the baby might be sleepy.

## Decisions (approved 2026-09-06)
- Predictive headline ("Likely hungry around 3:40 PM"), mirroring SleepCoachCard.
- Prediction is Flare+-gated (`PremiumGate feature="predictions"`); the existing
  elapsed-time state + hunger-cue list stay free and unchanged.
- Feed screen: promote the coach to the top of the Feeding tab as a `strip`.

## Plan
- [x] `src/lib/feedCoach.ts` — add `predictNextFeed()` + per-bracket
      `typicalIntervalMinutes`. Median of DAYTIME feed intervals only.
- [x] Retire `predictNextFeed` in `src/lib/nextEvent.ts`; point `NextEventBand`
      at the one engine so Home can't quote two hunger times.
- [x] `src/hooks/useFeedCoach.tsx` — mirror `useSleepCoach`.
- [x] `FeedCoachCard` — `variant: "card" | "strip"`, gated prediction headline,
      null-child guard, self-sourced `lastFeedAt`.
- [x] `Dashboard.tsx` + `homeSections.ts` — Home card behind a `feedCoach` toggle.
- [x] `FeedingLog.tsx` — move the card to the top as `variant="strip"`.
- [x] Tests in `src/lib/__tests__/feedCoach.test.ts`.
- [ ] QA pass, then commit + PR.

## Review

One engine, one clock, one night window. `predictNextFeed` lives in
`src/lib/feedCoach.ts`; `nextEvent.ts` keeps only `pickNextEvent`. `useFeedCoach`
resolves the night window and the minute ticker once and hands both to the card,
so the prediction and the elapsed-time state can't disagree about when the night
starts. NextEventBand now reads that hook instead of running its own query and
its own mean.

Judgement calls that differ from the plan:
- 1-3mo `typicalIntervalMinutes` is 210, not 195: it prints the same cadence
  sentence as the 3-6mo bracket ("every 3–4 hours"), so the two must share a
  midpoint or the number and the copy drift.
- The reason line says "daytime gaps between feeds", not "daytime feeds" — the
  count is intervals, and a number a parent reads has to name what it counted.
- The headline stands down once the window has closed rather than printing a
  stale clock time next to the live "it's been Xh" state. `feedPredictionHeadline`
  lives in the lib so it goes through the same copy discipline as `feedCoachCopy`.
- On the Feeding tab the card was already the first element under the page
  header (the timers live inside the log dialog), so the move was a no-op; only
  `variant="strip"` changed.
- `"feed-coach"` replaces the retired `"next-event"` root in
  `LOG_WRITE_QUERY_KEYS`, so a logged feed refreshes the prediction.

Verification: 674 tests pass (95 in feedCoach.test.ts, 14 new), `tsc --noEmit -p
tsconfig.app.json` clean, `npm run build` clean, eslint clean on every touched
file (the one warning in FeedingLog.tsx predates this change). The two
regression tests were mutation-checked — swapping the median for a mean and
dropping the night filter fails both.
