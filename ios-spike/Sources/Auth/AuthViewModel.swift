import Foundation
import Supabase

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var session: Session?
    @Published var isWorking = false
    @Published var errorMessage: String?
    @Published var pendingConfirmationEmail: String?

    private var listenerTask: Task<Void, Never>?

    func bootstrap() async {
        session = try? await SupabaseService.client.auth.session
        listenerTask?.cancel()
        listenerTask = Task { [weak self] in
            for await change in SupabaseService.client.auth.authStateChanges {
                await MainActor.run { self?.session = change.session }
            }
        }
    }

    func signIn(email: String, password: String) async {
        await perform {
            try await SupabaseService.client.auth.signIn(email: email, password: password)
            self.pendingConfirmationEmail = nil
        }
    }

    func signUp(email: String, password: String) async {
        await perform {
            let response = try await SupabaseService.client.auth.signUp(email: email, password: password)
            // When Supabase Auth has "Confirm email" enabled (the production setting),
            // signUp returns no session — the user must click the link in email #1
            // before the first VPC confirmation can advance.
            if response.session == nil {
                self.pendingConfirmationEmail = email
            }
        }
    }

    func resendConfirmation(email: String) async {
        await perform {
            try await SupabaseService.client.auth.resend(email: email, type: .signup)
        }
    }

    func signOut() async {
        await perform {
            try await SupabaseService.client.auth.signOut()
            self.pendingConfirmationEmail = nil
        }
    }

    private func perform(_ block: @escaping () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        do {
            try await block()
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }
}
