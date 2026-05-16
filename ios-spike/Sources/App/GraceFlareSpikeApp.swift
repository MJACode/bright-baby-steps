import SwiftUI

@main
struct GraceFlareSpikeApp: App {
    @StateObject private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .tint(.brandPrimary)
        }
    }
}

private struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        Group {
            if auth.session != nil {
                ChatView()
            } else {
                AuthView()
            }
        }
        .task { await auth.bootstrap() }
    }
}
