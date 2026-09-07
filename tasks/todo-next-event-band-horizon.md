# Next Event Band — horizon split (de-duplicate "Coach predicts" vs Sleep Coach)

## Problem

On Home, inside the last 60 minutes before a predicted nap, `NextEventBand`
("COACH PREDICTS — Likely sleepy around 5:30") and `SleepCoachCard`
("SLEEP COACH · Heads up — Nap around 5:30") state the same claim, quote the
same time, and repeat the same evidence line verbatim — in two separate blurred
`PremiumGate feature="predictions"` panels one scroll apart.

`src/lib/nextEvent.ts` already identified this exact anti-pattern and fixed it
for **feeds only** (`pickBandEvent` drops the feed side whenever `FeedCoachCard`
is rendered). The symmetric rule for naps was never written, because
`FeedCoachCard` always renders while `SleepCoachCard` only renders inside a
~60-minute window — which makes the sleep rule slightly harder, not different.

## Decision

Generalise the band's job from "the next event" to **"the event no coach card is
currently claiming"**:

- **Band = the far one.** The next nap/feed, whenever no card owns it.
- **Cards = the near one.** They own the moment, with the confidence dot, the
  state pill, the cue and the CTA.

The band keeps the two jobs the cards genuinely cannot do: predicting past the
cards' 60-minute horizon, and arbitrating nap-vs-feed so the parent doesn't
compare two cards.

## Tasks

- [x] Extract `deriveCoachState` out of `SleepCoachCard.tsx` into
      `src/lib/sleepCoachState.ts`; export a `sleepCoachShowing()` predicate.
      Single source of truth — the band must never re-derive "is the card up".
- [x] `pickBandEvent` takes `{ feedCoachVisible, sleepCoachShowing }` and drops
      whichever side a card owns. Update the file's doc comment.
- [x] `NextEventBand` gains a `sleepCoachVisible` prop and a 30s tick (it
      currently computes `minutesAway` once per render and never refreshes, so
      "in ~45 min" goes stale and the hand-off to the card would not fire).
- [x] `Dashboard.tsx` passes `sleepCoachVisible={isVisible("sleepCoach")}`.
- [x] Unit tests: `src/lib/__tests__/nextEvent.test.ts` (arbitration matrix) and
      the `sleepCoachShowing` boundary (61 min out → band; 59 min → card; window
      open → card; just-passed → card, except calm mode → band).
- [x] QA pass, then commit / push / draft PR.

## Deliberately out of scope

- **A Customize Home toggle for the band.** It renders unconditionally
  (`Dashboard.tsx:54`), so a parent who hides Sleep Coach still gets nap
  predictions and cannot turn predictions off anywhere. Real gap, separate
  decision — raised with the founder, awaiting a call.
- Removing the band entirely.

## Review

`deriveCoachState` + `CoachState` moved verbatim into
`src/lib/sleepCoachState.ts`, joined by `sleepCoachShowing()` —
`deriveCoachState(...) !== null`, the same predicate the card's own early
return uses. `SleepCoachCard` imports it and is otherwise unchanged (its
`date-fns` / `gentleTime` imports moved with the function).

`pickBandEvent(napAt, feedAt, owned: { nap: boolean; feed: boolean })` now
drops either side, not just the feed. `NextEventBand` gained
`sleepCoachVisible` and a 30s tick, and resolves `napOwned` as
`sleepCoachVisible && !!nap && sleepCoachShowing(now, ...)` — the section
being enabled is not enough, the card also has to be inside its window.

The pre-existing `src/test/nextEvent.test.ts` was moved to
`src/lib/__tests__/nextEvent.test.ts` (the path this plan names) rather than
duplicated; its three engine-agreement regression describes are intact and the
`pickBandEvent` block was rewritten for the ownership matrix.

23 tests in the two files, 677 across the suite, `tsc --noEmit -p
tsconfig.app.json` clean, `eslint` clean on the touched files, `npm run build`
green. No new colours, tokens or radii — no visual change to either surface.

The Customize Home toggle for the band stays out of scope, as agreed above.

### QA verdict — Pass

QA diffed the extracted `deriveCoachState` byte-for-byte against the deleted
block at the pre-change SHA (identical modulo `export`), confirmed the band
never re-derives the horizon, and confirmed both surfaces read the same
`["sleep-coach", childId]` cache entry — so the 2026-08-30 drifted-second-copy
shape is not reintroduced. `NextEventBand` has one JSX call site (Dashboard);
the Sleep tab's `variant="strip"` card has no band to collide with. 30s tick is
leak-free and does not re-run the feed engine.

One gap closed after the review: the pre-window cutoff was unpinned — the tests
probed −61 and −59 but never −60, so a `>=` typo on `sleepCoachState.ts:36`
passed the whole suite. Added the boundary case and mutation-checked it (the
flipped operator now fails). 24 tests in the two files.

### Follow-up raised by QA — separate ticket

`predictNextNap` never clamps `windowStart` to `now` (`src/lib/sleepCoach.ts`),
while `deriveCoachState` stands the card down once the window is >60 min past.
So a stale window can strand the band on "Likely sleepy anytime now" hours
later — e.g. wake 08:00, 90-min window → 09:15–09:45, and at 11:00 the card is
gone but the band still prints it. This is the same bug shape the feed side
already fixed (guarded at `src/lib/__tests__/nextEvent.test.ts` in the elapsed
hunger-window describe); the symmetric fix is for `predictNextNap` to return
null past its window. Out of scope here — this diff neither causes nor worsens
it — but the new "the band shows what no card is claiming" contract makes it
more visible, so it should be picked up next.

### Manual verification still owed before merge

Not runnable from this environment. On `npm run dev`, Home:
1. Nap >60 min out, Feed Coach on → band shows the nap, no Sleep Coach card.
2. At the ~60-min mark the band's nap line and the card swap in the same 30s
   tick, with no frame showing both.
3. Calm mode, ~90 min after `windowEnd` → check for a stranded "anytime now"
   (the follow-up above).
4. Toggling `sleepCoach` off mid-session hands the nap straight back to the band.
