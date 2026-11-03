# App Store v1 readiness (2026-11-03)

Founder decisions: v1 ships Flare+ as **free early access** (no purchase on iOS or web);
TestFlight pipeline is proven; App Review gets a **seeded demo account**.

## Backend
- [ ] Migration: every account gets Flare+ (`tier=plus`, `status=active`, `provider=early_access`); new-user trigger does the same. No partner "upgraded" notification spam.
- [ ] Demo reviewer seed script (VPC complete + sample child + ~7 days of logs), run by founder after creating the user.

## Frontend
- [ ] Paywall: no dead "Start trial" button. Plan status reads "Free during early access".
- [ ] Info.plist purpose strings match real features; drop unused native plugins (speech recognition, biometric, camera).
- [ ] Cry insights copy: no diagnostic claim, add "not medical advice".
- [ ] Terms § 5 / FAQ: early-access note + legal-review-log entry.

## Launch kit
- [ ] docs/app-store-launch.md: listing copy, review notes, privacy label, age rating, territories, founder checklist.

## Review
