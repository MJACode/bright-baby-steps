//
//  ActiveSession.swift
//  Local model for an in-progress timer started/observed on the watch. Mirrors
//  the subset of ActiveFeedRow / ActiveSleepRow that the watch needs (see
//  src/hooks/useActiveFeed.tsx and useActiveSleep.tsx).
//
//  Elapsed time is computed server-truth from `startedAt` (never trusting the
//  watch wall clock for the start moment) — the same approach as
//  computeElapsedSeconds() on the web.
//

import Foundation

enum SessionKind: String {
    case sleep
    case feed
}

struct ActiveSession: Identifiable, Equatable {
    let id: String            // row id in sleep_logs / feeding_logs
    let kind: SessionKind
    let startedAt: Date       // sleep_logs.started_at / feeding_logs.logged_at
    /// Sleep: "nap"|"night". Feed: "breast"|"bottle"|"pump".
    let subtype: String

    /// Wall-clock seconds since start (no pause handling on the watch for v1 —
    /// pause/resume stays a phone affordance; the watch only starts and stops).
    func elapsedSeconds(now: Date = Date()) -> Int {
        max(0, Int(now.timeIntervalSince(startedAt)))
    }
}
