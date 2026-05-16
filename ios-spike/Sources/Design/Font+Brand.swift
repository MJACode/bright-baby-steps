import SwiftUI

// Display moments use Quicksand (bold). Body and UI use Nunito.
// Brand guideline: Quicksand only for H1/H2/dialog titles, never body.

extension View {
    func quicksand(_ style: QuicksandStyle) -> some View {
        font(.custom(style.face, size: style.size).weight(.bold))
    }

    func nunito(_ style: NunitoStyle) -> some View {
        font(.custom(style.face, size: style.size).weight(style.weight))
    }
}

enum QuicksandStyle {
    case largeTitle, title, dialog

    var face: String { "Quicksand-Bold" }
    var size: CGFloat {
        switch self {
        case .largeTitle: return 32
        case .title: return 24
        case .dialog: return 20
        }
    }
}

enum NunitoStyle {
    case body, bodyBold, caption, captionBold

    var face: String {
        switch self {
        case .body, .caption: return "Nunito-Regular"
        case .bodyBold, .captionBold: return "Nunito-SemiBold"
        }
    }
    var size: CGFloat {
        switch self {
        case .body, .bodyBold: return 16
        case .caption, .captionBold: return 13
        }
    }
    var weight: Font.Weight {
        switch self {
        case .body, .caption: return .regular
        case .bodyBold, .captionBold: return .semibold
        }
    }
}
