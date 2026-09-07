# Timer stop button not working — fix + full timer/button audit

## Root cause (from the screenshot)

The screenshot shows the iOS text-selection callout ("Copy | Look Up | Translate")
with selection handles sitting **on the Left side button itself**, while the timer
kept running. On iOS WKWebView (we ship via Capacitor) the text inside a `<button>`
is selectable by default, so a slightly-long or slightly-dragged press — exactly how
a one-handed, sleep-deprived parent taps — starts a text selection and pops the
callout instead of firing `onClick`. The tap is swallowed; the timer never pauses.

Nothing in `src/index.css` or `src/components/ui/button.tsx` suppresses
`-webkit-touch-callout` / `user-select` on interactive elements, and nothing sets
`touch-action: manipulation` (which also costs a ~300ms double-tap-zoom delay on
iOS and makes buttons feel dead on the first tap).

The timer *logic* in `useActiveFeed` / `useActiveSleep` is sound — this is a touch
layer bug, not a state bug.

## Tasks

- [ ] Global touch hardening in `src/index.css`: `-webkit-touch-callout: none`,
      `user-select: none`, `touch-action: manipulation` on buttons / `[role="button"]`
      / `.touch-target`. Must NOT touch inputs, textareas, or body copy the parent
      may legitimately want to copy (legal pages).
- [ ] `select-none` on the timer faces (NursingTimer, SleepTimer) — selecting
      "07:20" is never useful and the callout covers the controls.
- [ ] NursingTimer: disable the side buttons while `start` / `setSide` are pending
      so a double-tap can't race two writes against a stale `active` row.
- [ ] Sweep every timer + control surface for the same class of bug and for missing
      `type="button"` / missing pending guards: NursingTimer, SleepTimer,
      FerberCheckInTimer, CryAnalyzer, ActiveSessionBanner, QuickNavGrid,
      PastSessionSheet, MobileDateTimePicker.
- [ ] Regression test: a side button pauses on a plain click and stays clickable.
- [ ] QA agent pass, then commit + push + draft PR.

## Review

(filled in at the end)
