# App Store v1 readiness (2026-11-03)

Founder decisions: v1 ships Flare+ as **free early access** (no purchase on iOS or web);
TestFlight pipeline is proven; App Review gets a **seeded demo account**.

## Backend
- [x] Migration: every account gets Flare+ (`tier=plus`, `status=active`, `provider=early_access`); new-user trigger does the same. No partner "upgraded" notification spam.
- [x] Demo reviewer seed script (VPC complete + sample child + ~7 days of logs), run by founder after creating the user.

## Frontend
- [x] Paywall: no dead "Start trial" button. Plan status reads "Free during early access".
- [x] Info.plist purpose strings match real features; drop unused native plugins (speech recognition, biometric, camera).
- [x] Cry insights copy: no diagnostic claim, add "not medical advice".
- [x] Terms § 5 / FAQ: early-access note + legal-review-log entry.

## Launch kit
- [x] docs/app-store-launch.md: listing copy, review notes, privacy label, age rating, territories, founder checklist.

## Review
- QA (backend): Pass after 3 fixes (legal-log entry, demo baby stays 4 months on re-run, signup function before backfill).
- QA (frontend): Pass; 5 should-fixes applied (signed-out /upgrade, "Upgrade" wording, stale test, comment, bun.lockb removed).
- Legal: early-access end mechanics + 30-day notice added; Privacy § 2 now lists data already collected; App Store label matches. 3 questions parked for outside counsel (see log).
- Checks: tsc clean, 1881/1881 tests, lint at baseline.
