//
//  AuthStateView.swift
//  Shown when the watch has no synced session yet (first launch, or after a
//  refresh-token rotation invalidated the watch's copy). The watch never signs
//  in directly — the phone is the source of truth.
//

import SwiftUI

struct AuthStateView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text("Open Grace Flare on your phone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Sign in there to sync your account to the watch.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
