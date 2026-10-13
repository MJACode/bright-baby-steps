# Allergen sign-off + "Keep it on the menu" maintenance — Oct 2026

Trigger: allergens auto-completed at 2 exposures (`allergenService.ts:32`), so
"Successfully Introduced" / "Flag for Review" never rendered, and nothing told
parents to keep feeding an introduced allergen. Founder approved Option B plus
a maintenance plan on 2026-10-12. Reminders are in-app AND push. Cadence follows
professional guidance. Existing test data is left as-is.

## Clinical basis (nutrition advisor, cited from memory, not yet re-verified)
- Peanut: ~6–7 g peanut protein/week over ≥3 feedings (NIAID 2017 Addendum; LEAP, Du Toit NEJM 2015) → target **3/week**
- Egg and all others: "regularly", about twice a week (AAAAI/ACAAI/CSACI 2020 consensus; EAT, Perkin NEJM 2016; ASCIA) → target **2/week**. Weak evidence: copy says "about", never a rule.
- Track to age 3 (36 months corrected or chronological, per the existing age helper), then progress only, no nudges.
- Never say: prevents, safe, not allergic, cleared. DB status `safe` never reaches UI. Never suggest re-offering after a reaction without a doctor.

## Decisions
- [x] Sign-off: in_progress plus ≥2 reaction-free exposures → "Did {child} eat a typical portion with no reaction?" → **Yes, it's on the menu** (status completed) / **Flag for Review**
- [x] High-risk (is_high_risk or any reaction history) sign-off copy adds "check with your pediatrician first"
- [x] Maintenance serving = exposure log with exposure_number ≥ 3 (no migration)
- [x] Due = fewer servings than the target in the rolling last 7 days; Lapsed = no exposure in 14+ days
- [x] In-app: card progress "2 of 3 this week", Due badge, due-first sort, Home nudge
- [x] Push: `allergen_maintenance` type; no serving in 7+ days; at most 1 per child per 7 days, batching allergens; respects mutes, quiet hours, cap

## Frontend (frontend agent)
- [x] allergenService status and removal logic; maintenance helpers
- [x] Sign-off card in the detail view
- [x] "Had it today" logging with MobileDateTimePicker (also back-dates exposure #2)
- [x] Overview progress, Due badge, sort; Home nudge
- [x] NotificationBell icon for `allergen_maintenance`

## Backend (backend agent)
- [x] check-notifications: `allergen_maintenance` producer + category + tests

## Review
- [x] QA, then PR (no migration → auto-merge on green)
