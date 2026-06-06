# Record on Apple Watch — watchOS companion groundwork

## Plan
Full pipeline incl. codemagic. Single SwiftUI watchOS App target. No DB migration
(source='watch'/'timer' already allowed). Reuse existing web write payloads + cry classifier spec.
Full plan: /root/.claude/plans/x-record-on-sequential-reddy.md

## Tasks
- [ ] Web bridge: `src/integrations/watch/watchBridge.ts` + `WatchBridge` mount component
- [ ] Wire `WatchBridge` into `App.tsx`
- [ ] iOS glue: `ios-watch-glue/WatchSessionBridge.swift`, `WatchSessionBridgePlugin.swift`, `WatchSessionBridge.m`
- [ ] Watch app: models (LogSource, CryBucket, ActiveSession)
- [ ] Watch app: connectivity (WatchSessionManager, SupabaseAuth)
- [ ] Watch app: network (SupabaseREST)
- [ ] Watch app: logging (QuickLogStore, TimerStore)
- [ ] Watch app: cry (CryFeatures, CryClassifier, CryRecorder) — port from cryFeatures.ts
- [ ] Watch app: views (Root, QuickLog, Timer, Cry, AuthState) + App entry
- [ ] Watch app icon asset catalog
- [ ] CI injection: `watch/project/{Gemfile,inject_watch_target.rb,Info-WatchApp.plist}`
- [ ] `watch/README.md`
- [ ] `codemagic.yaml` build steps (gem, inject, watch plist, signing, build)
- [ ] Update `docs/legal-review-log.md`
- [ ] Verify: `npm run build` + lint; structural review of Swift/Ruby
- [ ] QA pass, commit, push, open draft PR

## Review

Implemented the full pipeline groundwork (single SwiftUI watch target):
- Web bridge (`watchBridge.ts` + `WatchBridge.tsx`, mounted in `App.tsx`) — `npm run build` + eslint clean.
- iOS glue (`ios-watch-glue/`): WCSession delegate + Capacitor plugin.
- Watch app (`watch/GraceFlareWatch/`): token-sync auth + Keychain + self-refresh, direct PostgREST client, quick-tap/timer stores, Swift cry classifier port, AVAudioEngine recorder, 5 SwiftUI views.
- CI: `inject_watch_target.rb` (xcodeproj gem, `ruby -c` OK) + `codemagic.yaml` (gem install → 2nd signing profile w/ UUID export → inject → version bump → build).
- No DB migration; legal-review-log entry added.

QA verdict: Fix-required → all addressed:
- BLOCKING (live schema) — verified via Supabase MCP: `source` CHECK allows `watch`/`timer` (feeding/sleep) + `watch` (diaper); `active_side` allows `both`; `one_active_{feed,sleep}_per_child` indexes scope `source='timer'`; `cry_analyses` columns match the insert.
- BLOCKING (non-deterministic tiebreak in CryClassifier.swift) — fixed: rank an explicit ordered bucket array + index tiebreak to match the TS stable sort.
- SHOULD-FIX (CryView silent save catch) — now surfaces "Couldn't save — try the phone".
- SHOULD-FIX (codemagic export loop) — replaced with a Python resolver: newest profile per bundle id, single DEVELOPMENT_TEAM, echoes resolved values.

Cannot verify here (needs Xcode/macOS + paired devices, per plan): Swift compile, on-device WCSession/token-sync/mic, two-target CI signing. App ID `com.graceflare.app.watchkitapp` must be pre-registered in the Developer Portal before the codemagic change builds.
