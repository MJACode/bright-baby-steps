import SwiftUI

// Brand tokens mirror src/index.css :root variables. The web stores HSL,
// SwiftUI exposes HSB — `Color(hsl:)` converts so the source of truth
// stays as the values copied directly from the web stylesheet.

extension Color {
    /// Forest Teal — primary CTAs, active states.
    static let brandPrimary = Color(hslH: 152, s: 45, l: 48)
    /// Warm Orange — accent, highlights, the flare mark.
    static let brandAccent = Color(hslH: 30, s: 70, l: 55)
    /// Warm Cream — app background.
    static let brandBackground = Color(hslH: 30, s: 40, l: 98)
    /// Deep Slate — body text.
    static let brandForeground = Color(hslH: 240, s: 10, l: 20)
    /// Subtle border for cards and inputs.
    static let brandBorder = Color(hslH: 30, s: 20, l: 90)
    /// Destructive — errors only.
    static let brandDestructive = Color(hslH: 0, s: 72, l: 55)

    /// Module colors.
    static let moduleSleep = Color(hslH: 230, s: 65, l: 62)
    static let moduleFeeding = Color(hslH: 152, s: 50, l: 48)
    static let moduleDiapers = Color(hslH: 35, s: 85, l: 58)
    static let moduleMilestones = Color(hslH: 280, s: 55, l: 60)
    static let moduleFinance = Color(hslH: 172, s: 50, l: 42)

    init(hslH h: Double, s: Double, l: Double) {
        let (r, g, b) = hslToRgb(h: h / 360, s: s / 100, l: l / 100)
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

private func hslToRgb(h: Double, s: Double, l: Double) -> (Double, Double, Double) {
    if s == 0 { return (l, l, l) }
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s
    let p = 2 * l - q
    return (hueToRgb(p, q, h + 1.0 / 3.0),
            hueToRgb(p, q, h),
            hueToRgb(p, q, h - 1.0 / 3.0))
}

private func hueToRgb(_ p: Double, _ q: Double, _ t: Double) -> Double {
    var t = t
    if t < 0 { t += 1 }
    if t > 1 { t -= 1 }
    if t < 1.0 / 6.0 { return p + (q - p) * 6 * t }
    if t < 1.0 / 2.0 { return q }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6 }
    return p
}
