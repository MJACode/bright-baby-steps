# Server push + allergen rhythm — Oct 2026

Founder decisions (2026-10-13): build real server push (APNs) as reusable infra; no automatic
"Introduced" (parent signs off); no hard 3-day gate; weekly maintenance targets; reminders in-app +
push; free tier; both parents get pushes (never viewers). This session owns allergen maintenance
(the other session's plan, eb8421b, folded in: sign-off step, peanut 3/wk, others 2/wk, age 3).

## PR A — Server push (APNs) — MIGRATION, founder OK before merge
Backend
- [ ] Migration: `push_devices` (id, user_id → auth.users, token unique, platform 'ios',
      environment 'production'|'sandbox', created_at, last_seen_at); RLS owner-only; added to
      `_purge_user_data` / delete_user_account; default-privileges rules (20261009).
- [ ] `profiles.notification_prefs.push_enabled` (jsonb key, default true; no migration).
- [ ] `_shared/apns.ts`: ES256 JWT from APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID (cached ~50 min),
      HTTP/2 POST to api.push.apple.com (sandbox host per device env), topic com.graceflare.app;
      prune tokens on 410 / BadDeviceToken / Unregistered.
- [ ] check-notifications: after the mute/quiet/cap filter, send a push for each inserted
      notification to the recipient's devices when push_enabled. Copy never pairs child name +
      health detail on the lock screen. No push if secrets are missing (log once, in-app still works).
Frontend
- [ ] `@capacitor/push-notifications`; `src/lib/pushNotifications.ts`: ask permission after
      sign-in (not on cold start), register, upsert token, re-upsert on app resume, delete on sign-out.
- [ ] Tap on a push deep-links to the notification's target route.
- [ ] Notification settings: "Push notifications" switch.
- [ ] codemagic.yaml: add `aps-environment` entitlement + Push capability (glue pattern).
Legal
- [ ] PrivacyPage: device push token as a device identifier, Apple as push transport;
      /subprocessors if Apple counts; `docs/legal-review-log.md` entry. Legal agent review.
Founder manual steps
- [ ] Apple Developer: enable Push Notifications on com.graceflare.app; create APNs .p8 key.
- [ ] Supabase secrets: APNS_KEY (p8 contents), APNS_KEY_ID, APNS_TEAM_ID.

## PR B — Allergen rhythm (spec: tasks/proposal-allergen-maintenance.md)
- [ ] Remove hard 3-day gate; "Offer it again" step; same-day exposure #2 = confirm, not block.
- [ ] Sign-off: after ≥2 reaction-free exposures, intro stays in_progress until the parent taps
      "Yes, it's on the menu" (completed) or "Flag for review". No auto-complete.
- [ ] Soft spacing note for a different new allergen within 72 h.
- [ ] Weekly target (peanut 3, others 2; high-risk = pediatrician's plan), rolling 7 days, to age 3.
- [ ] "Offered today" one-tap + allergen chips on solid feeds → allergen_exposure_logs (#≥3).
- [ ] FeedingPage completed-count bug → getAllergenStatus.
- [ ] check-notifications `allergen_rhythm` weekly digest (owner + partners, not viewers); push via PR A.
- [ ] Suppress: any reaction, still introducing, opted out / snoozed / past age 3.

## Review
- [ ] QA after each PR; legal agent on PR A; nutrition advisor on PR B copy.
