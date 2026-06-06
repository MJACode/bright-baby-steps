//
//  CryFeatures.swift
//  Swift port of the feature-extraction half of src/lib/cryFeatures.ts. Runs
//  entirely on-device; audio never leaves the watch. The algorithm (frame size,
//  hop, RMS/ZCR, autocorrelation pitch, burst detection, rhythm score) mirrors
//  the TS implementation so web and watch produce comparable `features`.
//

import Foundation

struct CryFeatures {
    var duration_s: Double = 0
    var rms_mean: Double = 0       // overall loudness, 0-1
    var rms_peak: Double = 0
    var pitch_hz_mean: Double = 0  // dominant freq via autocorrelation
    var pitch_hz_peak: Double = 0
    var pitch_variance: Double = 0 // how stable is the pitch
    var zcr_mean: Double = 0       // zero-crossing rate, 0-1
    var rhythm_score: Double = 0   // 0-1, periodicity of loud bursts
    var burst_count: Int = 0       // # of distinct loud peaks
    var silence_ratio: Double = 0  // 0-1, fraction below threshold

    /// Serialised for the cry_analyses.features jsonb column — same keys the web
    /// uses so rows are interchangeable.
    func asDict() -> [String: Double] {
        [
            "duration_s": duration_s,
            "rms_mean": rms_mean,
            "rms_peak": rms_peak,
            "pitch_hz_mean": pitch_hz_mean,
            "pitch_hz_peak": pitch_hz_peak,
            "pitch_variance": pitch_variance,
            "zcr_mean": zcr_mean,
            "rhythm_score": rhythm_score,
            "burst_count": Double(burst_count),
            "silence_ratio": silence_ratio,
        ]
    }
}

enum CryFeatureExtractor {
    /// Mirrors extractFeatures(samples, sampleRate) in cryFeatures.ts.
    static func extract(samples: [Float], sampleRate: Double) -> CryFeatures {
        let duration_s = Double(samples.count) / sampleRate
        let frameSize = 2048
        let hopSize = 1024

        var rmsSum = 0.0
        var rmsPeak = 0.0
        var zcrSum = 0.0
        var pitches: [Double] = []
        var rmsFrames: [Double] = []
        var frameCount = 0

        var i = 0
        while i + frameSize < samples.count {
            let frame = Array(samples[i..<(i + frameSize)])
            let rms = computeRMS(frame)
            let zcr = computeZCR(frame)
            rmsSum += rms
            rmsPeak = max(rmsPeak, rms)
            zcrSum += zcr
            rmsFrames.append(rms)

            if rms > 0.05 {
                let p = autocorrelatePitch(frame, sampleRate: sampleRate)
                if p > 80 && p < 1500 { pitches.append(p) }
            }
            frameCount += 1
            i += hopSize
        }

        let rms_mean = frameCount > 0 ? rmsSum / Double(frameCount) : 0
        let zcr_mean = frameCount > 0 ? zcrSum / Double(frameCount) : 0
        let pitch_hz_mean = pitches.isEmpty ? 0 : pitches.reduce(0, +) / Double(pitches.count)
        let pitch_hz_peak = pitches.max() ?? 0
        let pitch_variance = pitches.isEmpty ? 0 : variance(pitches) / (pitch_hz_mean == 0 ? 1 : pitch_hz_mean)

        // Burst detection: count peaks above adaptive threshold.
        let rmsThreshold = max(0.08, rms_mean * 1.5)
        var burst_count = 0
        var inBurst = false
        var silentFrames = 0
        for r in rmsFrames {
            if r > rmsThreshold {
                if !inBurst { burst_count += 1; inBurst = true }
            } else {
                inBurst = false
                silentFrames += 1
            }
        }

        let rhythm_score = computeRhythmScore(rmsFrames, threshold: rmsThreshold)
        let silence_ratio = rmsFrames.isEmpty ? 1 : Double(silentFrames) / Double(rmsFrames.count)

        var f = CryFeatures()
        f.duration_s = duration_s
        f.rms_mean = rms_mean
        f.rms_peak = rmsPeak
        f.pitch_hz_mean = pitch_hz_mean
        f.pitch_hz_peak = pitch_hz_peak
        f.pitch_variance = pitch_variance
        f.zcr_mean = zcr_mean
        f.rhythm_score = rhythm_score
        f.burst_count = burst_count
        f.silence_ratio = silence_ratio
        return f
    }

    // MARK: - Primitives (mirror cryFeatures.ts)

    private static func computeRMS(_ frame: [Float]) -> Double {
        var s = 0.0
        for v in frame { s += Double(v) * Double(v) }
        return (s / Double(frame.count)).squareRoot()
    }

    private static func computeZCR(_ frame: [Float]) -> Double {
        var crossings = 0
        for i in 1..<frame.count {
            if (frame[i - 1] >= 0) != (frame[i] >= 0) { crossings += 1 }
        }
        return Double(crossings) / Double(frame.count)
    }

    private static func autocorrelatePitch(_ frame: [Float], sampleRate: Double) -> Double {
        let minPeriod = Int(sampleRate / 1500) // 1500 Hz max
        let maxPeriod = Int(sampleRate / 80)   // 80 Hz min
        var bestOffset = -1
        var bestCorr = 0.0
        guard minPeriod < maxPeriod, maxPeriod < frame.count else { return 0 }
        for offset in minPeriod..<maxPeriod {
            var corr = 0.0
            var i = 0
            while i < frame.count - offset {
                corr += Double(frame[i]) * Double(frame[i + offset])
                i += 1
            }
            if corr > bestCorr {
                bestCorr = corr
                bestOffset = offset
            }
        }
        return bestOffset > 0 ? sampleRate / Double(bestOffset) : 0
    }

    private static func variance(_ arr: [Double]) -> Double {
        guard !arr.isEmpty else { return 0 }
        let m = arr.reduce(0, +) / Double(arr.count)
        return arr.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(arr.count)
    }

    private static func computeRhythmScore(_ rmsFrames: [Double], threshold: Double) -> Double {
        var peaks: [Int] = []
        var inBurst = false
        for i in 0..<rmsFrames.count {
            if rmsFrames[i] > threshold && !inBurst {
                peaks.append(i)
                inBurst = true
            } else if rmsFrames[i] <= threshold {
                inBurst = false
            }
        }
        if peaks.count < 3 { return 0 }
        var intervals: [Double] = []
        for i in 1..<peaks.count { intervals.append(Double(peaks[i] - peaks[i - 1])) }
        let meanInt = intervals.reduce(0, +) / Double(intervals.count)
        let stdInt = variance(intervals).squareRoot()
        let cv = stdInt / (meanInt == 0 ? 1 : meanInt)
        return max(0, min(1, 1 - cv))
    }
}
