import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""

    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in"
        case signUp = "Create account"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header

                    if let pending = auth.pendingConfirmationEmail {
                        confirmationPending(email: pending)
                    } else {
                        formCard
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
            }
            .background(Color.brandBackground.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("Grace Flare")
                .quicksand(.largeTitle)
                .foregroundStyle(Color.brandForeground)
            Text("Confident, calm, modern parenting support.")
                .nunito(.body)
                .foregroundStyle(Color.brandForeground.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .padding(.top, 24)
    }

    private var formCard: some View {
        VStack(spacing: 16) {
            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            VStack(alignment: .leading, spacing: 6) {
                Text("Email").nunito(.caption).foregroundStyle(Color.brandForeground.opacity(0.7))
                TextField("you@example.com", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.brandBorder))
                    .frame(minHeight: 48)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Password").nunito(.caption).foregroundStyle(Color.brandForeground.opacity(0.7))
                SecureField("At least 8 characters", text: $password)
                    .textContentType(mode == .signIn ? .password : .newPassword)
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.brandBorder))
                    .frame(minHeight: 48)
            }

            if let error = auth.errorMessage {
                Text(error)
                    .nunito(.caption)
                    .foregroundStyle(Color.brandDestructive)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: submit) {
                ZStack {
                    if auth.isWorking { ProgressView().tint(.white) }
                    else { Text(mode.rawValue).nunito(.bodyBold) }
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Color.brandPrimary)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .disabled(auth.isWorking || email.isEmpty || password.isEmpty)
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 12, y: 4)
    }

    private func confirmationPending(email: String) -> some View {
        VStack(spacing: 16) {
            Text("Check your inbox")
                .quicksand(.title)
                .foregroundStyle(Color.brandForeground)
            Text("We sent a confirmation link to \(email). Click it to activate your account, then return here to sign in.")
                .nunito(.body)
                .foregroundStyle(Color.brandForeground.opacity(0.8))
                .multilineTextAlignment(.center)

            Button("Resend confirmation email") {
                Task { await auth.resendConfirmation(email: email) }
            }
            .nunito(.bodyBold)
            .foregroundStyle(Color.brandPrimary)
            .frame(maxWidth: .infinity, minHeight: 48)
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.brandPrimary))
            .disabled(auth.isWorking)

            Button("Use a different email") {
                auth.pendingConfirmationEmail = nil
            }
            .nunito(.caption)
            .foregroundStyle(Color.brandForeground.opacity(0.6))
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 12, y: 4)
    }

    private func submit() {
        Task {
            switch mode {
            case .signIn: await auth.signIn(email: email, password: password)
            case .signUp: await auth.signUp(email: email, password: password)
            }
        }
    }
}
