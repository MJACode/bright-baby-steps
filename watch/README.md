# Grace Flare — Apple Watch companion (groundwork)

A native **watchOS** companion app so a parent can record from the wrist:

- **Quick taps** — feed / diaper / quick sleep log (`source='watch'`)
- **Session timers** — start/stop sleep & feed timers (`source='timer'`, shared
  with the phone's active-session machinery)
- **Cry analysis** — record a short clip on-device, get a suggested bucket,
  optionally save it (audio never leaves the watch)

## Why the sources live here (not in `ios/`)

`ios/` is **gitignored and regenerated on every CI build**
(`rm -rf ios/ && npx cap add ios` in `codemagic.yaml`). Anything added inside
the generated Xcode project is wiped each build. So:

- The watch app sources live in **`watch/GraceFlareWatch/`** (committed).
- The iOS-side WatchConnectivity glue lives in **`ios-watch-glue/`** (committed).
- **`watch/project/inject_watch_target.rb`** (xcodeproj gem) wires both into the
  freshly-generated `ios/App/App.xcodeproj` during CI — adds the single SwiftUI
  watch target, the Embed Watch Content phase, per-target signing, and copies
  the glue into the App target.

## Architecture

```
Phone (web app in WKWebView)
  └─ src/integrations/watch/WatchBridge.tsx
       └─ pushWatchContext()  → Capacitor plugin "WatchSessionBridge"
            └─ ios-watch-glue/WatchSessionBridge.swift
                 └─ WCSession.updateApplicationContext({access/refresh token, expiresAt, childId})
                      └─ (Apple Watch) WatchSessionManager → SupabaseAuth
                           └─ SupabaseREST → Supabase PostgREST (parent's JWT, RLS applies)
```

- **Auth:** the phone relays the Supabase session to the watch. The watch writes
  **directly** to PostgREST under the parent's own JWT, refreshing the access
  token against `/auth/v1/token?grant_type=refresh_token` as needed. The watch
  never signs in itself — if it has no valid token it shows `AuthStateView`.
- **Cry classifier:** `Cry/CryFeatures.swift` + `Cry/CryClassifier.swift` are a
  line-for-line Swift port of `src/lib/cryFeatures.ts` (same thresholds), so web
  and watch agree. On-device only.

## Data model (no migration required)

The `source` CHECK on the log tables already permits `'watch'` and `'timer'`
(`supabase/migrations/20260515000000_active_sessions.sql`,
`20260429020000_log_source.sql`). Watch **timers** use `source='timer'` so they
share the `one_active_{sleep,feed}_per_child` partial unique indexes; quick taps
and diaper logs use `source='watch'`. `cry_analyses` has no source column.

## Building / verifying

This cannot be built on Linux — it needs Xcode/macOS:

1. **CI (codemagic `ios-release`):** `gem install xcodeproj` →
   `ruby watch/project/inject_watch_target.rb` → watch Info.plist + signing →
   `xcode-project build-ipa` embeds the watch app.
2. **Prerequisite:** the App ID `com.graceflare.app.watchkitapp` must be
   **pre-registered** in the Apple Developer Portal before the codemagic change
   merges — `fetch-signing-files --create` creates the *profile*, not the App ID.
3. **On-device:** WCSession token sync, token refresh, PostgREST writes, and mic
   cry recording require a paired iPhone + Apple Watch.

## Known limitations (groundwork)

- No pause/resume on watch timers (phone-only); the watch only starts and stops.
- Relay-queue fallback (`didReceiveUserInfo`) is a stub — the direct write path
  is the real one.
- Refresh-token rotation on the phone can briefly stale the watch's token; the
  phone re-pushes context on every `onAuthStateChange`, so the watch recovers on
  the next sync.
