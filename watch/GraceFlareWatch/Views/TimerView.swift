//
//  TimerView.swift
//  Start/stop sleep & feed session timers. These write source='timer' and
//  interoperate with the phone's active-session machinery — a timer started
//  here can be stopped on the phone and vice-versa.
//

import SwiftUI

struct TimerView: View {
    @EnvironmentObject var timers: TimerStore
    @State private var now = Date()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        List {
            Section("Sleep") {
                if let s = timers.activeSleep {
                    Text("Running · \(elapsed(s))").monospacedDigit()
                    Button(role: .destructive) {
                        Task { await timers.stopSleep() }
                    } label: { Label("Stop", systemImage: "stop.fill") }
                } else {
                    Button("Start nap") { Task { await timers.startSleep(type: "nap") } }
                    Button("Start night") { Task { await timers.startSleep(type: "night") } }
                }
            }
            Section("Feed") {
                if let f = timers.activeFeed {
                    Text("Running · \(elapsed(f))").monospacedDigit()
                    Button(role: .destructive) {
                        Task { await timers.stopFeed() }
                    } label: { Label("Stop", systemImage: "stop.fill") }
                } else {
                    Button("Start breast") { Task { await timers.startFeed(type: "breast") } }
                    Button("Start bottle") { Task { await timers.startFeed(type: "bottle") } }
                }
            }
            if let err = timers.lastError {
                Text(err).font(.caption2).foregroundStyle(.red)
            }
        }
        .navigationTitle("Timers")
        .onReceive(ticker) { now = $0 }
        .task { await timers.refresh() }
    }

    private func elapsed(_ session: ActiveSession) -> String {
        let sec = session.elapsedSeconds(now: now)
        return String(format: "%d:%02d", sec / 60, sec % 60)
    }
}
