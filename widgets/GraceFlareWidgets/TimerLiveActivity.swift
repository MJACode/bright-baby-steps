//
//  TimerLiveActivity.swift
//  Grace Flare — Lock Screen / Dynamic Island UI for running timers.
//
//  Renders the sleep / nursing / bottle / pump timers as a Live Activity so a
//  parent can see the elapsed time from the locked phone without opening the
//  app. The running state uses Text(timerInterval:) — the system ticks it
//  every second on the Lock Screen with zero updates from the app.
//
//  Widget-extension target only (deployment target iOS 16.1, so no
//  availability guards are needed here).
//

import ActivityKit
import WidgetKit
import SwiftUI

// Brand tokens from src/index.css, converted from HSL to SwiftUI's HSB.
// Native targets have no access to the CSS variables, so these mirror them:
//   Forest Teal  hsl(152 45% 48%)  →  hue 152°, HSB s 0.62, b 0.70
//   Warm Orange  hsl(30 70% 55%)   →  hue 30°,  HSB s 0.73, b 0.87
private let forestTeal = Color(hue: 152.0 / 360.0, saturation: 0.62, brightness: 0.70)
private let warmOrange = Color(hue: 30.0 / 360.0, saturation: 0.73, brightness: 0.87)

private struct KindPresentation {
    let title: String
    let symbol: String
}

private func presentation(for kind: String) -> KindPresentation {
    switch kind {
    case "sleep":   return KindPresentation(title: "Sleep", symbol: "moon.zzz.fill")
    case "nursing": return KindPresentation(title: "Nursing", symbol: "heart.fill")
    case "bottle":  return KindPresentation(title: "Bottle", symbol: "drop.fill")
    case "pump":    return KindPresentation(title: "Pumping", symbol: "timer")
    default:        return KindPresentation(title: "Timer", symbol: "timer")
    }
}

private func formattedElapsed(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}

/// Ticking count-up while running; frozen value while paused.
private struct ElapsedTimerText: View {
    let state: TimerActivityAttributes.ContentState

    var body: some View {
        if let paused = state.pausedElapsedSeconds {
            Text(formattedElapsed(paused))
        } else {
            // The far-future upper bound just keeps the interval open; the
            // system ends the activity long before (8h Live Activity cap).
            Text(
                timerInterval: state.startReference...Date(timeIntervalSinceNow: 48 * 60 * 60),
                countsDown: false
            )
        }
    }
}

private struct LockScreenTimerView: View {
    let context: ActivityViewContext<TimerActivityAttributes>

    var body: some View {
        let kind = presentation(for: context.attributes.kind)
        HStack(spacing: 12) {
            Image(systemName: kind.symbol)
                .font(.title2)
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(forestTeal, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.title)
                    .font(.system(.headline, design: .rounded).bold())
                if context.state.pausedElapsedSeconds != nil {
                    Text("Paused")
                        .font(.subheadline)
                        .foregroundColor(warmOrange)
                } else if !context.state.label.isEmpty {
                    Text(context.state.label)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            ElapsedTimerText(state: context.state)
                .font(.system(.title2, design: .rounded).monospacedDigit().bold())
                .foregroundColor(forestTeal)
                .multilineTextAlignment(.trailing)
        }
        .padding(16)
    }
}

struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerActivityAttributes.self) { context in
            LockScreenTimerView(context: context)
        } dynamicIsland: { context in
            let kind = presentation(for: context.attributes.kind)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(kind.title, systemImage: kind.symbol)
                        .font(.system(.headline, design: .rounded))
                        .foregroundColor(forestTeal)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedTimerText(state: context.state)
                        .font(.system(.title3, design: .rounded).monospacedDigit())
                        .foregroundColor(forestTeal)
                        .frame(maxWidth: 72)
                        .multilineTextAlignment(.trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.pausedElapsedSeconds != nil {
                        Text("Paused").font(.caption).foregroundColor(warmOrange)
                    } else if !context.state.label.isEmpty {
                        Text(context.state.label).font(.caption).foregroundColor(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: kind.symbol).foregroundColor(forestTeal)
            } compactTrailing: {
                ElapsedTimerText(state: context.state)
                    .monospacedDigit()
                    .foregroundColor(forestTeal)
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: kind.symbol).foregroundColor(forestTeal)
            }
        }
    }
}
