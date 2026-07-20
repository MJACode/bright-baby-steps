# GraceFlareWidgets — Live Activity lock-screen timers

When a sleep / nursing / bottle / pump timer is running, this widget extension
puts it on the iPhone Lock Screen and in the Dynamic Island as a **Live
Activity** with a self-ticking elapsed timer (iOS 16.1+). No notifications, no
polling — the system renders `Text(timerInterval:)` every second on its own.

## How it fits together

```
widgets/GraceFlareWidgets/
  TimerActivityAttributes.swift   Shared ActivityAttributes — compiled into BOTH
                                  the App target and this extension (ActivityKit
                                  matches the type across the process boundary)
  TimerLiveActivity.swift         Lock Screen + Dynamic Island SwiftUI views
  GraceFlareWidgetsBundle.swift   @main WidgetBundle entry point
widgets/project/
  Info-Widgets.plist              NSExtension → com.apple.widgetkit-extension
  inject_widgets_target.rb        CI-time injection into the generated Xcode project
ios-live-activity-glue/
  LiveActivityTimerPlugin.swift   Capacitor plugin (App target): start/update/end
  LiveActivityTimer.m             CAP_PLUGIN registration
src/integrations/liveActivity/
  liveActivityClient.ts           JS bridge; iOS-only, no-ops elsewhere
src/lib/sessionNotifications.ts   Single funnel all four timers already used —
                                  now starts a Live Activity first and only
                                  falls back to a local notification when the
                                  activity can't start (iOS <16.1, disabled in
                                  Settings, Android)
```

`ios/` is regenerated on every CI build (`rm -rf ios/ && npx cap add ios`), so
— exactly like the watch target (`watch/README.md`) — the extension can't live
inside it. `inject_widgets_target.rb` runs in the Codemagic workflow after
`cap add ios` + signing, and:

1. copies `ios-live-activity-glue/*.{swift,m}` into the App target,
2. creates the `GraceFlareWidgets` app-extension target
   (`com.graceflare.app.widgets`, deployment target 16.1),
3. adds `TimerActivityAttributes.swift` to **both** targets,
4. embeds the extension into the App's `PlugIns/` and pins Manual signing from
   `DEVELOPMENT_TEAM` / `WIDGETS_PROFILE_UUID` (exported to `$CM_ENV` by the
   signing step).

The host app's `NSSupportsLiveActivities` key is injected by the Codemagic
"Inject Info.plist permission strings" step.

## One-time manual step (Apple Developer Portal)

Register the App ID **`com.graceflare.app.widgets`** in
Apple Developer Portal → Identifiers (plain App ID, no extra capabilities) —
same as was done for `com.graceflare.app.watchkitapp`.
`app-store-connect fetch-signing-files --create` creates the provisioning
*profile* automatically but will fail if the App ID doesn't exist.

## Behavior notes / known limits

- The activity starts/updates/ends from the phone app only. Timers started or
  stopped **from the Apple Watch** don't drive the phone's Live Activity yet;
  a phone-side activity left behind goes stale and iOS auto-ends Live
  Activities after ~8 hours anyway. Reconciliation on app-resume is a
  follow-up.
- Pause / resume (sleep, bottle) and side switches (nursing, pump) update the
  activity so the lock-screen elapsed matches the in-app timer (to the same
  rounded-minute baseline the in-app display restarts from after a switch).
- While pumping "both" sides, the in-app total (left + right − both) ticks
  1s/s, matching the lock screen; the double-counted per-side flush lands on
  both surfaces at once at the next switch or stop.
- iOS < 16.1, Live Activities disabled in Settings, and Android all fall back
  to the pre-existing local-notification card.
