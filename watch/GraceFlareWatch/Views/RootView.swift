//
//  RootView.swift
//  Top-level navigation. Shows AuthStateView until the phone has synced a
//  session; otherwise a list routing to Quick Log / Timers / Cry.
//

import SwiftUI

struct RootView: View {
    @EnvironmentObject var auth: SupabaseAuth

    var body: some View {
        if auth.isAuthed {
            NavigationStack {
                List {
                    NavigationLink {
                        QuickLogView()
                    } label: {
                        Label("Quick Log", systemImage: "plus.circle.fill")
                    }
                    NavigationLink {
                        TimerView()
                    } label: {
                        Label("Timers", systemImage: "timer")
                    }
                    NavigationLink {
                        CryView()
                    } label: {
                        Label("Cry", systemImage: "waveform")
                    }
                }
                .navigationTitle("Grace Flare")
            }
        } else {
            AuthStateView()
        }
    }
}
