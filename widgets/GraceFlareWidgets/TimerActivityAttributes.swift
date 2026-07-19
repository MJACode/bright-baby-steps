//
//  TimerActivityAttributes.swift
//  Grace Flare — shared Live Activity model for running timers.
//
//  Compiled into BOTH the iOS App target (where the Capacitor plugin in
//  ios-live-activity-glue/ starts/updates/ends activities) and the
//  GraceFlareWidgets extension target (where TimerLiveActivity renders them).
//  ActivityKit matches the two sides by this type's name + shape, so the exact
//  same file must be a member of both targets — inject_widgets_target.rb
//  wires that up at CI time.
//

import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct TimerActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// When the timer is running, the Lock Screen renders
        /// `Text(timerInterval: startReference...)` — a self-ticking count-up
        /// anchored here. The app back-dates this by the already-elapsed
        /// active seconds, so pauses never inflate the displayed time.
        var startReference: Date
        /// Non-nil means the timer is paused; the UI shows this frozen value
        /// instead of the ticking interval.
        var pausedElapsedSeconds: Int?
        /// Secondary line under the title, e.g. "Left side", "Nap". Empty hides it.
        var label: String
    }

    /// Supabase row id of the running session (feeding_logs / sleep_logs).
    var sessionId: String
    /// One of "sleep" | "nursing" | "bottle" | "pump" — mirrors SessionKind
    /// in src/lib/sessionNotifications.ts.
    var kind: String
}
#endif
