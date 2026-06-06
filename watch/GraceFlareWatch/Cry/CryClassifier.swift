//
//  CryClassifier.swift
//  Swift port of classify() in src/lib/cryFeatures.ts. The scoring thresholds
//  are the spec — keep them identical to the TS so web and watch agree.
//
//  SUGGESTION engine, not diagnostic.
//

import Foundation

struct CryResult {
    let bucket: CryBucket
    let confidence: Double // 0-1
    let features: CryFeatures
    let alternates: [(bucket: CryBucket, confidence: Double)]
}

enum CryClassifier {
    static func classify(_ features: CryFeatures) -> CryResult {
        var scores: [CryBucket: Double] = [
            .hunger: 0, .discomfort: 0, .tired: 0, .pain: 0, .gas: 0, .unknown: 0,
        ]

        // Not actually crying?
        if features.rms_peak < 0.04 || features.silence_ratio > 0.85 {
            return CryResult(bucket: .unknown, confidence: 0.9, features: features, alternates: [])
        }

        // PAIN: sudden, high-pitched, sustained, loud
        if features.pitch_hz_peak > 600 && features.rms_peak > 0.35 { scores[.pain]! += 0.5 }
        if features.pitch_variance < 0.2 && features.rms_mean > 0.2 { scores[.pain]! += 0.2 }
        if features.burst_count <= 2 && features.duration_s > 3 { scores[.pain]! += 0.15 }

        // HUNGER: rhythmic, mid-pitch, repeated short bursts
        if features.rhythm_score > 0.55 && features.burst_count >= 3 { scores[.hunger]! += 0.45 }
        if features.pitch_hz_mean > 300 && features.pitch_hz_mean < 550 { scores[.hunger]! += 0.15 }
        if features.silence_ratio > 0.25 && features.silence_ratio < 0.55 { scores[.hunger]! += 0.1 }

        // TIRED: lower energy, falling pitch, breathy (high zcr)
        if features.rms_mean < 0.18 && features.pitch_hz_mean < 400 { scores[.tired]! += 0.35 }
        if features.zcr_mean > 0.18 { scores[.tired]! += 0.15 }
        if features.duration_s > 5 && features.burst_count < 4 { scores[.tired]! += 0.1 }

        // GAS: short staccato grunts, low pitch, many small bursts
        if features.burst_count >= 5 && features.pitch_hz_mean < 350 { scores[.gas]! += 0.35 }
        if features.rhythm_score < 0.4 && features.rms_mean > 0.15 { scores[.gas]! += 0.15 }

        // DISCOMFORT: irregular, mid-pitch, no clear pattern
        if features.rhythm_score < 0.35 && features.pitch_variance > 0.3 { scores[.discomfort]! += 0.3 }
        if features.rms_mean > 0.1 && features.rms_mean < 0.25 { scores[.discomfort]! += 0.15 }

        // Rank, excluding unknown. Deterministic to match cryFeatures.ts: the
        // web ranks Object.entries(scores) in fixed insertion order (hunger,
        // discomfort, tired, pain, gas) with a STABLE Array.sort. Swift's
        // Dictionary iteration order is unspecified and sorted(by:) is not
        // guaranteed stable, so we rank an explicit ordered array and break ties
        // by that fixed index — otherwise an exact-tie cry could classify
        // differently on the watch than on the phone.
        let order: [CryBucket] = [.hunger, .discomfort, .tired, .pain, .gas]
        let ranked = order.enumerated()
            .map { (index: $0.offset, bucket: $0.element, score: scores[$0.element] ?? 0) }
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }

        let top = ranked[0]

        // Floor: nothing scored well → discomfort (the safe bucket).
        if top.score < 0.25 {
            return CryResult(
                bucket: .discomfort,
                confidence: 0.4,
                features: features,
                alternates: ranked[1..<min(3, ranked.count)].map { ($0.bucket, $0.score) }
            )
        }

        return CryResult(
            bucket: top.bucket,
            confidence: min(0.85, top.score + 0.15), // cap — never "sure"
            features: features,
            alternates: ranked[1..<min(3, ranked.count)].map { ($0.bucket, $0.score) }
        )
    }
}
