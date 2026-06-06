//
//  CryBucket.swift
//  Mirrors the CryBucket union + BUCKET_LABELS copy in src/lib/cryFeatures.ts
//  and the bucket CHECK on public.cry_analyses.
//
//  This is a SUGGESTION engine, not a diagnostic. The UI must always frame
//  results as "could be" + "trust your gut + pediatrician".
//

import Foundation

enum CryBucket: String, CaseIterable {
    case hunger
    case discomfort
    case tired
    case pain
    case gas
    case unknown

    /// Short title shown on the result card (mirrors BUCKET_LABELS.title).
    var title: String {
        switch self {
        case .hunger: return "Sounds like hunger"
        case .tired: return "Sounds like tired"
        case .discomfort: return "Sounds like discomfort"
        case .pain: return "Could be pain"
        case .gas: return "Sounds like gas"
        case .unknown: return "Not sure yet"
        }
    }

    var emoji: String {
        switch self {
        case .hunger: return "🍼"
        case .tired: return "😴"
        case .discomfort: return "🤔"
        case .pain: return "💢"
        case .gas: return "🫧"
        case .unknown: return "👂"
        }
    }

    /// One short tip suitable for the small watch screen (first tip from
    /// BUCKET_LABELS.tips, trimmed for the wrist).
    var tip: String {
        switch self {
        case .hunger: return "Try offering breast or bottle."
        case .tired: return "Check the wake window — dim lights, white noise."
        case .discomfort: return "Check diaper, temperature, clothing tags."
        case .pain: return "If you can't soothe in 15–20 min, call your pediatrician."
        case .gas: return "Bicycle legs, tummy massage, or burp upright."
        case .unknown: return "Try a longer sample (5+ s) closer to baby."
        }
    }
}
