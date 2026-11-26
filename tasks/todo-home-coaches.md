# Home: "Your coaches" section + always-on Sleep Coach — Nov 2026

Trigger: founder screenshot of Home. Sleep Coach only shows ~60 min around the
nap window; founder wants a coaches section with Sleep Coach always visible.

## Decisions (approved by founder, 2026-11-26)
- Section header **"Your coaches"** — not "AI coaches": both coaches are on-device
  math, no LLM, and "AI" would imply data goes to Anthropic (Privacy § 4).
- Sleep Coach **always renders** on Home. Mirrors Feed Coach: free content
  (awake-for time, age-typical wake window, sleepy cues) + Flare+ prediction
  blurred via `PremiumGate("predictions")`.
- Existing near-window states (heads-up / coming-up / open / just-passed /
  sleeping) still take over when active.
- **Remove `NextEventBand` from Home.** Keep it on CaregiverHome (`showBoth`).
- Cue lists (sleepy + hunger) **collapsed behind a tap unless the window is
  active** (sleep: coming-up / open; feed: when its state shows cues today).
- Order: Greeting → QuickNav → FamilyNamePrompt → **Your coaches** (Sleep, Feed)
  → TodayCard ("This week") → Leaps → Customize home.

## Tasks
- [x] Frontend: idle state for `SleepCoachCard` (card variant only; strip on
      Sleep tab unchanged)
- [x] Frontend: `SLEEPY_CUES` constant + collapsible cue lists in both coaches
- [x] Frontend: Dashboard reorder, "Your coaches" header, drop NextEventBand
- [x] Tests updated / added; `tsc`, vitest, lint green
- [x] QA pass
- [ ] PR (no migration → auto-merge policy applies)


## Review (2026-11-26)
- Built by `frontend`, reviewed by `qa` → Fix-required (duplicate Start nap on Sleep
  tab strip; typecheck failure in a test; free-tier cue auto-open leaked window timing;
  orphaned heading; 11px labels). All fixed in a follow-up commit.
- Final: typecheck exit 0; vitest 117 files / 2659 tests pass; lint baseline 103/14 unchanged.
- Not verified in a real device: blur overlay fit in the 120px prediction block, cue
  toggle tap area on iOS.
