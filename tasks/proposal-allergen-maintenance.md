# Proposal — Allergen maintenance feeding (not started; needs founder decision)

Raised 2026-10-12 while adding "what to watch for" guidance to the Allergen Tracker.

## Problem
The tracker models introduction as a finish line: two exposures, a fixed 3-day
wait between them, then "Successfully Introduced ✓". Current guidance
(NIAID 2017 addendum, 2021 AAAAI/ACAAI/CSACI consensus, AAP 2019) says the
protective part is what comes *after*: once a baby tolerates an allergen, keep
offering it regularly (roughly a few times a week). Stopping can undo the
benefit. The 3-day gap is a reasonable conservative habit, not a requirement.

The guidance PR adds one line ("Keep it on the menu a few times a week…") to
the Introduced card. That's copy only. Nothing in the product helps a parent
actually do it.

## Options
1. **Copy only (shipped with the guidance PR).** Zero build. Parents get told once.
2. **"Last offered" per allergen.** Show "Last offered 9 days ago" on introduced
   allergens, fed from solid-food feeding logs tagged with an allergen. Needs
   a way to tag a solids log with allergens (new column or join), plus a nudge
   when an introduced allergen hasn't appeared in ~7 days.
3. **Weekly allergen checklist.** A light "this week" row of the introduced
   allergens with tap-to-mark. Simpler than tagging feeds, but it's a second
   logging surface for the same food.

## Recommendation
Option 2, scoped after we see whether parents use the tracker past the first
introductions. Reuses the existing feeding log instead of adding a second
place to record food.

## Open questions for the founder
- Do we keep the fixed 3-day wait as a hard gate on logging exposure #2, or
  make it advisory?
- Is "Introduced" still the right end state, or should it become "Introduced —
  keep offering"?
- Run the copy past the nutrition advisor before any build.
