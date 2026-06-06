//
//  TimerStore.swift
//  Start/stop sleep & feed session timers from the watch. These rows use
//  source='timer' (NOT 'watch') so they share the phone's "one active session
//  per child" partial unique index and surface in useActiveFeed/useActiveSleep —
//  a timer started on the watch can be stopped on the phone and vice-versa.
//
//  v1 does NOT implement pause/resume on the watch (that stays a phone
//  affordance). Stopping anchors ended_at = now / duration_minutes = elapsed,
//  matching the web's behaviour for an un-paused session.
//

import Foundation
import Combine

@MainActor
final class TimerStore: ObservableObject {
    private let auth: SupabaseAuth
    private var rest: SupabaseREST { SupabaseREST(auth: auth) }

    @Published private(set) var activeSleep: ActiveSession?
    @Published private(set) var activeFeed: ActiveSession?
    @Published private(set) var busy = false
    @Published var lastError: String?

    init(auth: SupabaseAuth) {
        self.auth = auth
    }

    enum TimerError: Error { case noChild, noParent }

    private func ids() throws -> (child: String, parent: String) {
        guard let child = auth.childId else { throw TimerError.noChild }
        guard let parent = auth.parentId() else { throw TimerError.noParent }
        return (child, parent)
    }

    private static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    private static func parseDate(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    // MARK: - Refresh (read current active sessions)

    func refresh() async {
        guard let child = auth.childId else { return }
        do {
            if let row = try await rest.activeSession(table: "sleep_logs", childId: child, openField: "ended_at") {
                activeSleep = Self.session(from: row, kind: .sleep, startField: "started_at", subtypeField: "sleep_type")
            } else {
                activeSleep = nil
            }
            if let row = try await rest.activeSession(table: "feeding_logs", childId: child, openField: "duration_minutes") {
                activeFeed = Self.session(from: row, kind: .feed, startField: "logged_at", subtypeField: "feeding_type")
            } else {
                activeFeed = nil
            }
        } catch {
            lastError = "\(error)"
        }
    }

    private static func session(from row: [String: Any], kind: SessionKind, startField: String, subtypeField: String) -> ActiveSession? {
        guard let id = row["id"] as? String,
              let started = parseDate(row[startField] as? String) else { return nil }
        let subtype = (row[subtypeField] as? String) ?? ""
        return ActiveSession(id: id, kind: kind, startedAt: started, subtype: subtype)
    }

    // MARK: - Sleep

    func startSleep(type: String) async {
        await run {
            let (child, parent) = try ids()
            let now = Date()
            let id = try await rest.insert(table: "sleep_logs", row: [
                "child_id": child,
                "parent_id": parent,
                "started_at": Self.iso(now),
                "sleep_type": type,
                "source": LogSource.timer.rawValue,
            ])
            if let id = id {
                activeSleep = ActiveSession(id: id, kind: .sleep, startedAt: now, subtype: type)
            }
        }
    }

    func stopSleep() async {
        guard let sleep = activeSleep else { return }
        await run {
            try await rest.update(table: "sleep_logs", id: sleep.id, changes: [
                "ended_at": Self.iso(Date()),
                "paused_at": NSNull(),
            ])
            activeSleep = nil
        }
    }

    // MARK: - Feed

    /// type: "breast" | "bottle" | "pump".
    func startFeed(type: String) async {
        await run {
            let (child, parent) = try ids()
            let now = Date()
            let id = try await rest.insert(table: "feeding_logs", row: [
                "child_id": child,
                "parent_id": parent,
                "feeding_type": type,
                "logged_at": Self.iso(now),
                "duration_minutes": NSNull(),
                "source": LogSource.timer.rawValue,
            ])
            if let id = id {
                activeFeed = ActiveSession(id: id, kind: .feed, startedAt: now, subtype: type)
            }
        }
    }

    func stopFeed() async {
        guard let feed = activeFeed else { return }
        await run {
            let mins = max(1, feed.elapsedSeconds() / 60)
            try await rest.update(table: "feeding_logs", id: feed.id, changes: [
                "duration_minutes": mins,
                "active_side": NSNull(),
                "side_started_at": NSNull(),
            ])
            activeFeed = nil
        }
    }

    // MARK: - Helper

    private func run(_ work: () async throws -> Void) async {
        busy = true
        lastError = nil
        defer { busy = false }
        do {
            try await work()
        } catch {
            lastError = "\(error)"
        }
    }
}
