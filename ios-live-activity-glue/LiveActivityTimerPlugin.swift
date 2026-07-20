//
//  LiveActivityTimerPlugin.swift
//  Grace Flare — Capacitor plugin driving the timer Live Activity.
//
//  JS calls (see src/integrations/liveActivity/liveActivityClient.ts):
//    LiveActivityTimer.startTimerActivity({sessionId, kind, running, elapsedSeconds, label})
//    LiveActivityTimer.updateTimerActivity({sessionId, running, elapsedSeconds, label?})
//    LiveActivityTimer.endTimerActivity({sessionId})
//
//  The activity UI lives in the GraceFlareWidgets extension
//  (widgets/GraceFlareWidgets/TimerLiveActivity.swift); the shared
//  TimerActivityAttributes type is compiled into both targets.
//
//  Injected into ios/App/App/ + added to the App target by
//  widgets/project/inject_widgets_target.rb during CI.
//
//  NOTE: this deliberately uses the iOS 16.1 ActivityKit API surface
//  (Activity.request(attributes:contentState:pushType:), update(using:),
//  end(using:dismissalPolicy:), activity.contentState). Those calls are
//  deprecated-with-replacement in 16.2 but fully functional; using them keeps
//  a single code path down to the 16.1 floor where Live Activities appeared.
//

import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(LiveActivityTimerPlugin)
public class LiveActivityTimerPlugin: CAPPlugin {

    /// Resolves {started: true} only when an activity was actually requested,
    /// so the JS side can fall back to a local notification otherwise
    /// (iOS < 16.1, or Live Activities disabled in Settings).
    @objc func startTimerActivity(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId"),
              let kind = call.getString("kind") else {
            call.reject("Missing sessionId or kind")
            return
        }
        let running = call.getBool("running") ?? true
        let elapsed = call.getDouble("elapsedSeconds") ?? 0
        let label = call.getString("label") ?? ""
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            Task {
                let started = await TimerActivityManager.shared.start(
                    sessionId: sessionId, kind: kind, label: label,
                    running: running, elapsedSeconds: elapsed
                )
                call.resolve(["started": started])
            }
            return
        }
        #endif
        call.resolve(["started": false])
    }

    @objc func updateTimerActivity(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("Missing sessionId")
            return
        }
        let running = call.getBool("running") ?? true
        let elapsed = call.getDouble("elapsedSeconds") ?? 0
        let label = call.getString("label")
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            TimerActivityManager.shared.update(
                sessionId: sessionId, label: label,
                running: running, elapsedSeconds: elapsed
            )
        }
        #endif
        call.resolve()
    }

    @objc func endTimerActivity(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("Missing sessionId")
            return
        }
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            TimerActivityManager.shared.end(sessionId: sessionId)
        }
        #endif
        call.resolve()
    }
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
final class TimerActivityManager {
    static let shared = TimerActivityManager()
    private init() {}

    // Looked up from the system list (not a local dict) so activities survive
    // app relaunch: JS can end/update a session whose Activity object was
    // requested by a previous process.
    private func activities(for sessionId: String) -> [Activity<TimerActivityAttributes>] {
        Activity<TimerActivityAttributes>.activities.filter { $0.attributes.sessionId == sessionId }
    }

    private func contentState(label: String, running: Bool, elapsedSeconds: Double) -> TimerActivityAttributes.ContentState {
        let elapsed = max(0, elapsedSeconds)
        if running {
            // Back-date the anchor by the active elapsed time so the ticking
            // Text(timerInterval:) shows pause-adjusted elapsed, not wall clock.
            return TimerActivityAttributes.ContentState(
                startReference: Date(timeIntervalSinceNow: -elapsed),
                pausedElapsedSeconds: nil,
                label: label
            )
        }
        return TimerActivityAttributes.ContentState(
            startReference: Date(),
            pausedElapsedSeconds: Int(elapsed),
            label: label
        )
    }

    func start(sessionId: String, kind: String, label: String, running: Bool, elapsedSeconds: Double) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        // Replace any leftover activity for the same session (e.g. app was
        // killed mid-session and the timer is being re-hydrated). Await the
        // ends so the request below is ordered after them — otherwise two
        // activities for the same session can briefly coexist.
        for activity in activities(for: sessionId) {
            await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
        }
        let attributes = TimerActivityAttributes(sessionId: sessionId, kind: kind)
        do {
            _ = try Activity.request(
                attributes: attributes,
                contentState: contentState(label: label, running: running, elapsedSeconds: elapsedSeconds),
                pushType: nil
            )
            return true
        } catch {
            return false
        }
    }

    func update(sessionId: String, label: String?, running: Bool, elapsedSeconds: Double) {
        for activity in activities(for: sessionId) {
            let resolvedLabel = label ?? activity.contentState.label
            let state = contentState(label: resolvedLabel, running: running, elapsedSeconds: elapsedSeconds)
            Task { await activity.update(using: state) }
        }
    }

    func end(sessionId: String) {
        for activity in activities(for: sessionId) {
            Task { await activity.end(using: activity.contentState, dismissalPolicy: .immediate) }
        }
    }
}
#endif
