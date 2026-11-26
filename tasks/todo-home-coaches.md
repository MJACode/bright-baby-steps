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
- [ ] Frontend: idle state for `SleepCoachCard` (card variant only; strip on
      Sleep tab unchanged)
- [ ] Frontend: `SLEEPY_CUES` constant + collapsible cue lists in both coaches
- [ ] Frontend: Dashboard reorder, "Your coaches" header, drop NextEventBand
- [ ] Tests updated / added; `tsc`, vitest, lint green
- [ ] QA pass
- [ ] PR (no migration → auto-merge policy applies)

## Review
_(filled after QA)_
