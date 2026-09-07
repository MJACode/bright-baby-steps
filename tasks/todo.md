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

- [x] Global touch hardening in `src/index.css`: `-webkit-touch-callout: none`,
      `user-select: none`, `touch-action: manipulation` on buttons / `[role="button"]`
      / `.touch-target`. Must NOT touch inputs, textareas, or body copy the parent
      may legitimately want to copy (legal pages).
- [x] `select-none` on the timer faces (NursingTimer, SleepTimer) — selecting
      "07:20" is never useful and the callout covers the controls.
- [x] NursingTimer: disable the side buttons while `start` / `setSide` are pending
      so a double-tap can't race two writes against a stale `active` row.
- [x] Sweep every timer + control surface for the same class of bug and for missing
      `type="button"` / missing pending guards: NursingTimer, SleepTimer,
      FerberCheckInTimer, CryAnalyzer, ActiveSessionBanner, QuickNavGrid,
      PastSessionSheet, MobileDateTimePicker.
- [x] Regression test: a side button pauses on a plain click and stays clickable.
- [x] QA agent pass, then commit + push + draft PR.

## Review

**Fixed.** The stop/pause tap was being swallowed by iOS text selection, not lost
in the timer state. One `@layer base` rule now suppresses `-webkit-touch-callout`
and `user-select` and sets `touch-action: manipulation` on controls; it is wrapped
in `:where()` so it carries zero specificity and any control that genuinely needs
selectable text opts out with a plain `select-text` utility.

Verified: 38 test files / 684 tests pass, typecheck clean, build clean, eslint
126 problems — byte-identical to the base branch (all pre-existing, in
`supabase/functions/**` and `tailwind.config.ts`).

**What is NOT covered by test.** jsdom has no selection engine, no
`-webkit-touch-callout` and no `touch-action`, so the CSS half — the actual root
cause — cannot be exercised automatically. The three new tests were mutation-checked:
reverting `sidesLocked` fails the two pending-guard tests, while the pause test
passes either way, so it is a fence around the handler contract only. **The callout
fix needs a tap on a real iOS build before this is called done.**

### Deliberate trades

- `ActiveSessionBanner` strips grew ~36px → 48px. They were the only interactive
  surface below the brand's 48px minimum, and `touch-target` is what pulls them
  into the rule. Banner height is not load-bearing (`DashboardLayout` is a flex
  column; the banner is `shrink-0` and `<main>` is `flex-1 min-h-0`).
- Medication and temperature rows in `MedicalTab` are whole-row buttons, so their
  text is no longer long-press selectable. Left as-is on purpose: making them
  selectable recreates the exact swallowed-tap bug on those rows, and the values
  are still selectable inside the edit dialog's inputs. Revisit only if a parent
  actually reports wanting to copy from the list.
- The side buttons pulse while a write is in flight. The lock outlasts the write
  itself (`setSide`'s `onSuccess` awaits `invalidateQueries`, and the query client
  retries 3× with backoff), so on a bad connection it can hold for seconds —
  without an affordance that reads as another dead button.

### Swept, nothing to fix

`FerberCheckInTimer`, `QuickNavGrid`, `PastSessionSheet`, `MobileDateTimePicker`
(wheel columns are `role="spinbutton"` divs — the selector cannot match them, and
`manipulation` still permits pan), Radix slider/scroll-area/drawer handles, and
every `<form>` in the app (no latent accidental-submit).
