# Sleep tab — pattern view + Sleep Coach callout

Branch: `claude/sleep-tab-patterns-coach-m7ymda`

## Decisions (approved 2026-09-05)
- Pattern view (24h rhythm + weekly observations) is **free**. Only the next-nap
  prediction stays behind `PremiumGate feature="predictions"`.
- Sleep Coach is **fused into the timer card** as a prediction strip — one Start
  button on the tab, not two. Home-screen `SleepCoachCard` keeps its current
  standalone form via a `variant` prop (no fork).
- **Full restructure**: tabs die, History moves to its own route.

## New IA (single scroll)
1. H1 "Sleep" + child name (info popover cut)
2. **Now card** — prediction strip (gated) + timer + one Start CTA; Ferber /
   Chair render in this card's footer when a night sleep is active
3. **Today's rhythm** — 24h band, hero total, 3 stat tiles, age-band caption
4. `SleepTodoCard` (Today's Sleep Plan) — unchanged
5. **This week** — 7-day nap/night bars + bedtime band + <=2 derived observations
6. Sleep plan — demoted to one tappable row (absorbs the reminder banner)
7. Recent sleep — last 3 tracking days + "See all sleep →" (`/dashboard/sleep/history`)

## Tasks
### Data layer
- [ ] `src/lib/sleepPatterns.ts` — pure, tested helpers: day segmentation across
      the tracking-day boundary, longest stretch, nap count, wake windows,
      bedtime band (median + spread), nap-count week-over-week, coverage rule
- [ ] Extract the wake-window gap calc out of `predictNextNap` rather than
      rewriting it
- [ ] `useSleepDay` / `useSleepWeek` query hooks (day-scoped; the existing
      50-row desc query is the wrong shape)

### Data-correctness fixes (found during research, verified in code)
- [ ] Delete `ageMinSleepHours` + `sleepRecommendations` from SleepPage; read
      `TOTAL_SLEEP_BY_BRACKET` / `NAPS_BY_BRACKET` from `sleepPlan.ts`.
      Today `"3mo": 14` vs canonical `12` false-flags a typical 4-month-old.
- [ ] `detectTriageReasons` early_waking: gate to >=3 months and count only the
      final night segment per tracking day (today a 2:40am feed-split reads as
      an early wake)
- [ ] SleepPage `ageMonths` must use corrected age for preemies, matching
      `useSleepCoach` (today the tab and the coach disagree)

### UI
- [ ] Fuse coach into timer card; `variant` prop on `SleepCoachCard`; gate wraps
      only the prediction strip, never the timer
- [ ] `TodayRhythmCard` — 3 states (asleep / awake / **no data**, visually inert);
      fixed 12AM–12AM axis; in-progress session open-ended to now; tap → that day
- [ ] `SleepWeekCard` — lift `SleepNapNightChart` out of AnalyticsPage, do not
      build a second one
- [ ] `SleepHistoryPage` route + move `GroupedLogList` / `useLogHistory` / edit
      dialog wholesale
- [ ] Cut: Tabs block, info popover, both static advice strings (keep the
      calm-mode extreme-shortfall soft-out verbatim), plan entry card, reminder
      banner off the main scroll
- [ ] Persistent under-1 safe-sleep line (AAP ABCs), non-suppressible in calm mode

### Copy / guardrails
- [ ] Thresholds: >=3 logged days for rhythm; >=5 qualifying nights for any night
      claim; 14 days before nap timing is called personal. Reuse the existing
      `sleepCoach` confidence ladder, do not invent a second one.
- [ ] No score, no grade, no red/green trend arrows, no wakings count, no
      time-to-settle, no method-joined-to-trend copy
- [ ] Calm mode: keeps facts (rhythm, totals), drops evaluations (comparisons,
      bedtime spread, first-nap time)
- [ ] Insufficient data reads "Log 5 nights and your bedtime range shows up
      here" — never "you've logged 3 of 7 days"

## Review
_(to fill in)_
