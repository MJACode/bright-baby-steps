//
//  QuickLogStore.swift
//  One-shot "quick tap" inserts for feeding / sleep / diaper, plus the cry
//  analysis insert. Payload shapes mirror QuickLogFAB.tsx and the cry insert in
//  src/hooks/useCryAnalyzer flow. All quick-tap rows carry source='watch' so
//  they're identifiable as watch-originated. cry_analyses has no source column.
//

import Foundation

@MainActor
struct QuickLogStore {
    let auth: SupabaseAuth
    var rest: SupabaseREST { SupabaseREST(auth: auth) }

    enum StoreError: Error { case noChild, noParent }

    private func ids() throws -> (child: String, parent: String) {
        guard let child = auth.childId else { throw StoreError.noChild }
        guard let parent = auth.parentId() else { throw StoreError.noParent }
        return (child, parent)
    }

    private static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    // MARK: - Feeding

    /// type: "bottle" | "breast" | "solid". amountOz applies to bottle,
    /// durationMin to breast (matches the web quick-log fields).
    func logFeeding(type: String, amountOz: Double? = nil, durationMin: Int? = nil) async throws {
        let (child, parent) = try ids()
        var row: [String: Any] = [
            "child_id": child,
            "parent_id": parent,
            "feeding_type": type,
            "logged_at": Self.iso(Date()),
            "source": LogSource.watch.rawValue,
        ]
        if type == "bottle", let oz = amountOz { row["amount_oz"] = oz }
        if type == "breast", let mins = durationMin { row["duration_minutes"] = mins }
        try await rest.insert(table: "feeding_logs", row: row)
    }

    // MARK: - Sleep (completed, e.g. "just finished a nap")

    /// Logs a finished sleep of `minutes`, anchored to now (ended_at = now,
    /// started_at = now - minutes). source='watch' (NOT a running timer).
    func logSleep(type: String, minutes: Int) async throws {
        let (child, parent) = try ids()
        let now = Date()
        let started = now.addingTimeInterval(TimeInterval(-minutes * 60))
        let row: [String: Any] = [
            "child_id": child,
            "parent_id": parent,
            "sleep_type": type,
            "started_at": Self.iso(started),
            "ended_at": Self.iso(now),
            "source": LogSource.watch.rawValue,
        ]
        try await rest.insert(table: "sleep_logs", row: row)
    }

    // MARK: - Diaper

    /// type: "wet" | "dirty" | "mixed".
    func logDiaper(type: String) async throws {
        let (child, parent) = try ids()
        let row: [String: Any] = [
            "child_id": child,
            "parent_id": parent,
            "diaper_type": type,
            "logged_at": Self.iso(Date()),
            "source": LogSource.watch.rawValue,
        ]
        try await rest.insert(table: "diaper_logs", row: row)
    }

    // MARK: - Cry analysis

    func logCry(bucket: CryBucket, confidence: Double, features: [String: Double]) async throws {
        let (child, parent) = try ids()
        let row: [String: Any] = [
            "child_id": child,
            "parent_id": parent,
            "bucket": bucket.rawValue,
            "confidence": confidence,
            "features": features,
            "occurred_at": Self.iso(Date()),
        ]
        try await rest.insert(table: "cry_analyses", row: row)
    }
}
