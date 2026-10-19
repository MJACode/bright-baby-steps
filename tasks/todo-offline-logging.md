# Offline logging — log now, sync later (Oct 2026)

Trigger: founder request (2026-10-18). Parents lose signal in hospital
basements, on flights, and on rural drives. Today every feed / sleep / diaper
write goes straight to Supabase and fails with no signal, and nothing is cached
on the phone, so the app opens to empty or spinning screens.

Approved direction: **option 2, "log offline, sync later"**, which includes
option 1 (keep the last-loaded data on the phone).

## What the parent experiences
- The app opens with no service and shows the last data it loaded.
- Logging a feed, diaper or sleep (quick log, the full forms, and timer
  start / pause / resume / stop) works offline. The entry appears right away
  with a small "Waiting to sync" marker.
- A quiet banner says "You're offline. Logs will sync when you're back online."
- When signal returns, logs upload in the order they were made. The marker
  disappears and the banner shows "All caught up".
- If a log can't be saved after it syncs (for example, it overlaps another
  sleep), it stays on the phone and the parent sees what happened and can fix
  or discard it. Nothing disappears silently.
- AI cards (briefing, insights, Visit Prep) show "Available when you're back
  online" instead of an error.

## Scope
**In:** `feeding_logs`, `sleep_logs`, `diaper_logs`. That covers creating,
editing and deleting them, plus the sleep and feed timers. Read caching
covers every screen that reads them.

**Out (later, if wanted):** milestones, photos, Records (temperature, illness,
medication), Apple Watch offline queue, SMS logging, and opening the web
version offline (it needs a service worker; iOS already bundles the app).

## Defaults I'm assuming (founder can override)
- [ ] **Partner conflicts:** if both parents log the same feed offline, keep
      both. Either parent can delete the duplicate. No merge logic.
- [ ] **"Via text"** means typing into the app's normal forms, not SMS.
- [ ] **How long we keep it:** cached data covers the last 7 days. Unsynced
      logs are kept until they sync, with no expiry.
- [ ] **Sign out with unsynced logs:** warn first ("2 logs haven't synced
      yet"). Signing out clears all cached child data from the phone.

## Approach (reuse first)
React Query already has offline support built in, so no new sync engine:
- Persist the query cache and paused writes to the phone
  (`@tanstack/react-query-persist-client` + an IndexedDB store). This adds
  two small dependencies.
- Use `networkMode: "offlineFirst"`. Offline writes pause, survive an app
  restart, and resume on reconnect.
- The phone generates each log's ID (`crypto.randomUUID()`), so a retried
  upload can't create a duplicate. Timer updates target that same ID, so
  "start offline, stop offline" works.
- Wire Capacitor's network status into React Query's `onlineManager`, so
  WKWebView reports offline reliably.
- Refresh the auth session before replaying writes. Keep the
  `invalidateAfterLogWrite` list in `src/lib/logInvalidation.ts` as the one
  place that refreshes screens.

## Tasks
### Frontend (`frontend` agent)
- [x] Mobbin: 3–5 references for offline banner, pending-sync row marker,
      and sync-failure recovery (iOS). Required by the standing rule.
- [x] Persisted `QueryClient` + `onlineManager` wiring in `App.tsx`
- [x] Move inline writes into keyed mutation hooks, with defaults registered
      so paused writes can resume after a restart. Writes to move:
      `FeedingLog.tsx`, `SleepPage.tsx`, `SleepHistoryPage.tsx`,
      `DiapersPage.tsx`, `useActiveSleep.tsx`, `useActiveFeed.tsx`,
      `useDeleteWithUndo.tsx`
- [x] Optimistic insert into today's lists, plus a "Waiting to sync" marker
- [x] Offline / syncing / caught-up banner, and the sync-failure sheet
- [x] Offline state for AI cards
- [x] Sign-out warning, and clear the cache on sign-out
- [x] Tests: queue, replay order, no duplicates on retry, survives restart,
      overlap failure surfaces
- [x] Legal pre-review must-haves: store keyed to user id, wipe on account
      change / remote deletion / revoked child, Delete Account uses the
      sign-out clear, clear before `auth.signOut()`, queued writes never
      expire (reads trimmed to 7 days), persistence native-only

### Backend (`backend` agent)
- [ ] Confirm the three tables accept a client-supplied UUID `id` and that RLS
      allows it. Expected: no migration needed.
- [ ] Confirm `no_overlapping_sleep` errors come back with a clear code that
      the UI can explain

### Legal (`legal` agent)
- [ ] Child data now sits on the device (cached, cleared at sign-out). Check
      Privacy § 8 / security wording, and update `docs/legal-review-log.md`

### QA (`qa` agent)
- [ ] Review after frontend lands. Manual test on device in airplane mode:
      log → kill app → reopen → reconnect → confirm in Supabase

## Risks
- iOS can evict web storage under low disk. Unlikely for small data, and
  the worst case is today's behavior.
- Sleep overlap on sync (two parents both timed the same nap). This is
  handled by the failure sheet, not silently dropped.
- Long offline (days) with an expired token. The session refreshes before
  replay; if the refresh fails, the parent signs in and the queue then
  replays.

## Review
_(filled in after ship)_
