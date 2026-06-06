//
//  CryView.swift
//  Records a short cry sample on-device, classifies it, and offers to save the
//  result to cry_analyses. Keeps the non-diagnostic framing from cryFeatures.ts:
//  always "could be" + "trust your gut + pediatrician".
//

import SwiftUI

struct CryView: View {
    @EnvironmentObject var auth: SupabaseAuth
    @StateObject private var recorder = CryRecorder()
    @State private var saved = false
    @State private var saveError = false

    var body: some View {
        VStack(spacing: 8) {
            switch recorder.state {
            case .idle, .error:
                if let err = recorder.errorMessage {
                    Text(err).font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
                }
                Button {
                    recorder.start()
                } label: {
                    Label("Record", systemImage: "mic.fill")
                }
                Text("A suggestion, not a diagnosis.")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)

            case .recording:
                Text("Listening…").font(.headline)
                ProgressView(value: min(1, recorder.level))
                Button("Stop") { recorder.stop() }

            case .analyzing:
                ProgressView("Analyzing…")

            case .result:
                if let r = recorder.result {
                    Text(r.bucket.emoji).font(.system(size: 34))
                    Text(r.bucket.title).font(.headline).multilineTextAlignment(.center)
                    Text(r.bucket.tip).font(.caption2).multilineTextAlignment(.center)
                    Text("Trust your gut + your pediatrician.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button(saved ? "Saved ✓" : "Save") {
                        saveError = false
                        Task {
                            do {
                                try await QuickLogStore(auth: auth).logCry(
                                    bucket: r.bucket,
                                    confidence: r.confidence,
                                    features: r.features.asDict()
                                )
                                saved = true
                            } catch {
                                // Surface the failure — the button stays enabled to retry.
                                saveError = true
                            }
                        }
                    }
                    .disabled(saved)
                    if saveError {
                        Text("Couldn't save — try the phone")
                            .font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
                    }
                    Button("Again") { recorder.reset(); saved = false; saveError = false }
                }
            }
        }
        .padding(.horizontal, 4)
        .navigationTitle("Cry")
    }
}
