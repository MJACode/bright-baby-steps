//
//  CryRecorder.swift
//  Records mic audio on the watch with AVAudioEngine (8s cap), accumulates mono
//  Float32 samples, then runs on-device feature extraction + classification.
//  Mirrors the lifecycle of src/hooks/useCryAnalyzer.tsx
//  (idle → recording → analyzing → result). Audio never leaves the device.
//

import Foundation
import AVFoundation
import Combine

@MainActor
final class CryRecorder: ObservableObject {
    enum State: Equatable { case idle, recording, analyzing, result, error }

    @Published private(set) var state: State = .idle
    @Published private(set) var result: CryResult?
    @Published private(set) var level: Double = 0      // live mic level 0-1
    @Published var errorMessage: String?

    private let maxDurationMs = 8000
    private let engine = AVAudioEngine()
    private var samples: [Float] = []
    private var sampleRate: Double = 16_000
    private var autoStop: DispatchWorkItem?

    func start() {
        errorMessage = nil
        result = nil
        level = 0
        samples.removeAll(keepingCapacity: true)

        let session = AVAudioSession.sharedInstance()
        session.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self = self else { return }
                guard granted else {
                    self.fail("Microphone access is needed to analyze a cry.")
                    return
                }
                self.beginEngine(session)
            }
        }
    }

    private func beginEngine(_ session: AVAudioSession) {
        do {
            try session.setCategory(.record, mode: .measurement, options: [])
            try session.setActive(true)

            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            sampleRate = format.sampleRate

            input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
                guard let self = self, let ch = buffer.floatChannelData else { return }
                let frames = Int(buffer.frameLength)
                let ptr = ch[0]
                var peak: Float = 0
                var chunk = [Float](repeating: 0, count: frames)
                for i in 0..<frames {
                    let v = ptr[i]
                    chunk[i] = v
                    peak = max(peak, abs(v))
                }
                Task { @MainActor in
                    self.samples.append(contentsOf: chunk)
                    self.level = Double(peak)
                }
            }

            engine.prepare()
            try engine.start()
            state = .recording

            let work = DispatchWorkItem { [weak self] in self?.stop() }
            autoStop = work
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(maxDurationMs), execute: work)
        } catch {
            fail("Couldn't start recording: \(error.localizedDescription)")
        }
    }

    func stop() {
        guard state == .recording else { return }
        autoStop?.cancel()
        autoStop = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false)
        analyze()
    }

    private func analyze() {
        state = .analyzing
        let captured = samples
        let rate = sampleRate
        // Feature extraction is cheap but keep the UI responsive.
        Task {
            let features = CryFeatureExtractor.extract(samples: captured, sampleRate: rate)
            let r = CryClassifier.classify(features)
            await MainActor.run {
                self.result = r
                self.state = .result
            }
        }
    }

    func reset() {
        autoStop?.cancel()
        autoStop = nil
        if engine.isRunning {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        samples.removeAll()
        result = nil
        level = 0
        errorMessage = nil
        state = .idle
    }

    private func fail(_ message: String) {
        errorMessage = message
        state = .error
    }
}
