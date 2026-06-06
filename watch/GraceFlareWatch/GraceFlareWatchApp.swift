//
//  GraceFlareWatchApp.swift
//  Entry point for the Grace Flare watchOS companion (single SwiftUI App
//  target, bundle id com.graceflare.app.watchkitapp). Activates the WCSession
//  manager on launch so the auth context the phone pushes is adopted as soon as
//  it arrives.
//

import SwiftUI

@main
struct GraceFlareWatchApp: App {
    @StateObject private var auth = SupabaseAuth.shared
    @StateObject private var timers = TimerStore(auth: SupabaseAuth.shared)

    init() {
        WatchSessionManager.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(timers)
        }
    }
}
