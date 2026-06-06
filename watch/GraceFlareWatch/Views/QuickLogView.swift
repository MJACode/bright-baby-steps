//
//  QuickLogView.swift
//  One-tap feed / diaper / sleep logging. Mirrors the quick-log categories in
//  QuickLogFAB.tsx, trimmed for the wrist. Rows are written with source='watch'.
//

import SwiftUI

struct QuickLogView: View {
    @EnvironmentObject var auth: SupabaseAuth
    @State private var status: String?
    @State private var busy = false

    private var store: QuickLogStore { QuickLogStore(auth: auth) }

    var body: some View {
        List {
            Section("Feed") {
                logButton("Bottle 🍼") { try await store.logFeeding(type: "bottle") }
                logButton("Breast") { try await store.logFeeding(type: "breast") }
                logButton("Solid") { try await store.logFeeding(type: "solid") }
            }
            Section("Diaper") {
                logButton("Wet") { try await store.logDiaper(type: "wet") }
                logButton("Dirty") { try await store.logDiaper(type: "dirty") }
                logButton("Mixed") { try await store.logDiaper(type: "mixed") }
            }
            Section("Sleep") {
                logButton("Nap · 30 min") { try await store.logSleep(type: "nap", minutes: 30) }
                logButton("Nap · 60 min") { try await store.logSleep(type: "nap", minutes: 60) }
            }
        }
        .navigationTitle("Quick Log")
        .overlay(alignment: .bottom) {
            if let status = status {
                Text(status)
                    .font(.caption2)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    // Plain translucent pill: Material (.thinMaterial) is
                    // watchOS 10+, but this target deploys to watchOS 9.0.
                    .background(Color.black.opacity(0.6), in: Capsule())
                    .padding(.bottom, 4)
            }
        }
    }

    @ViewBuilder
    private func logButton(_ title: String, _ action: @escaping () async throws -> Void) -> some View {
        Button(title) {
            guard !busy else { return }
            busy = true
            Task {
                do {
                    try await action()
                    status = "Logged ✓"
                } catch {
                    status = "Couldn't log — try the phone"
                }
                busy = false
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                status = nil
            }
        }
        .disabled(busy)
    }
}
