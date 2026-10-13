# Tasks: Adaptive Wake Windows

Local gate for every phase: `npm run typecheck && npm test && npm run lint:baseline`.

## Phase 1 — Engine *(frontend)*
- [ ] T001 `src/lib/wakeWindow.ts`: anchors + `ageWakeWindow(ageMo)` (FR-002), `personalWakeWindow` (FR-003), `positionOffsets` (FR-004), `wakeWindowSignals` (FR-005), `wakeWindowState` incl. decision, gates, step, revert (FR-006/008), copy helpers obeying FR-011.
- [ ] T002 `src/lib/__tests__/wakeWindow.test.ts`: anchors exact, interpolation (5.8 mo → 132/89/162), monotone across 0–48 mo with no step > 5 min per 0.1 mo, blend weights, each signal on/off, each gate, Lulu fixture.

## Phase 2 — App wiring *(frontend)*
- [ ] T003 `sleepCoach.ts`: `ageDefaultWakeWindowMin` → engine typical; `predictNextNap` blends via engine and honors accepted first-window target.
- [ ] T004 `sleepPlan.ts`: plan exposes engine range/display; sample day from personal target + offsets; `upcomingBracketChange` drops wake-window jump; 6–9 mo nap label.
- [ ] T005 `useSleepPlan.tsx`: `useWakeWindowDecision` mutation merging overrides (accept/dismiss/revert), upsert if no row, error + 0-row handling.
- [ ] T006 `SleepCoachCard.tsx`: "Why this time?" drawer + suggestion card (Try it / Not now).
- [ ] T007 Update existing tests broken by intended behavior changes (only with justification).

## Phase 3 — Weekly insight *(backend + frontend)*
- [ ] T008 `weekly-insights/index.ts`: validate `wakeWindow`, add prompt section + JSON field, validate response (backend).
- [ ] T009 `WeeklyInsightsPage.tsx`: send engine block; render note + Try it (frontend).
- [ ] T010 `_shared/personas.ts` sleep ranges per FR-010 (backend).

## Phase 4 — Close-out
- [ ] T011 `docs/legal-review-log.md` entry.
- [ ] T012 QA agent pass; fix-required loop.
- [ ] T013 Verify against Lulu's live data shape; PR.
