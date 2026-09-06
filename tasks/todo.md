# Hunger indicators on Home + Feed screen

Goal: tell the parent when the baby might be hungry, mirroring how Sleep Coach
tells them when the baby might be sleepy.

## Decisions (approved 2026-09-06)
- Predictive headline ("Likely hungry around 3:40 PM"), mirroring SleepCoachCard.
- Prediction is Flare+-gated (`PremiumGate feature="predictions"`); the existing
  elapsed-time state + hunger-cue list stay free and unchanged.
- Feed screen: promote the coach to the top of the Feeding tab as a `strip`.

## Plan
- [ ] `src/lib/feedCoach.ts` — add `predictNextFeed()` + per-bracket
      `typicalIntervalMinutes`. Median of DAYTIME feed intervals only.
- [ ] Retire `predictNextFeed` in `src/lib/nextEvent.ts`; point `NextEventBand`
      at the one engine so Home can't quote two hunger times.
- [ ] `src/hooks/useFeedCoach.tsx` — mirror `useSleepCoach`.
- [ ] `FeedCoachCard` — `variant: "card" | "strip"`, gated prediction headline,
      null-child guard, self-sourced `lastFeedAt`.
- [ ] `Dashboard.tsx` + `homeSections.ts` — Home card behind a `feedCoach` toggle.
- [ ] `FeedingLog.tsx` — move the card to the top as `variant="strip"`.
- [ ] Tests in `src/lib/__tests__/feedCoach.test.ts`.
- [ ] QA pass, then commit + PR.

## Review
_(filled in after implementation)_
