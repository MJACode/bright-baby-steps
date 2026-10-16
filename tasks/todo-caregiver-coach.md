# Caregiver access: log-only vs log + sleep & feed coach

Founder decisions (2026-10-16):
- Roles offered: Co-parent and Caregiver. View-only is removed (0 rows live).
- Co-parent: same access as the owner, free or Flare+.
- Caregiver on Flare+: owner picks "Log only" (default) or "Log + sleep & feed coach".
- Caregiver on free: log only; the choice is hidden.
- Flare+ lapses: setting is kept but hidden; comes back on renewal.
- Existing caregivers (2 live) are backfilled to coach ON so nobody loses it.
- Name: "Log + sleep & feed coach" (the coach is local math, not an LLM).

## Plan
- [x] Backend: `caregiver_coach` on partner_access + partner_invitations, backfill existing caregivers, carry through accept_partner_invitation, block new `viewer` rows
- [x] Frontend: role picker + PartnerManagement toggle (Flare+ only), invite writes, useCurrentRole exposes coach flag, PremiumGate("predictions") honours it, CaregiverHome shows the coach, drop View-only from pickers/copy
- [x] Copy: FAQ / Privacy / Upgrade mentions of View-only; legal-review-log entry
- [x] QA pass
- [ ] PR (adds a migration: founder OK required before merge)

## Review (2026-10-16)
- QA round 1: Fix-required. Coach header and the "Why this time?" button sat outside PremiumGate and still showed to log-only caregivers. Fixed with `useCaregiverCoachHidden`; the RLS toast no longer says "View-only".
- tsc clean, lint at baseline (107/14), vitest 1780/1780.
- Follow-ups (not in this PR): AcceptInvite can't show the invitee whether they get the coach (`lookup_partner_invitation` doesn't return it); UpgradeSheet / PartnerManagement teaser copy still describes 2 seats instead of 4.
