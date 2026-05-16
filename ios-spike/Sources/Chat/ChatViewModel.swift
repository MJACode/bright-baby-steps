import Foundation
import Supabase

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var input: String = ""
    @Published var isStreaming: Bool = false
    @Published var errorMessage: String?

    var skill: String = "general"

    private let client = ChatStreamClient()
    private var streamTask: Task<Void, Never>?

    func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }
        let userMsg = ChatMessage(role: .user, content: text)
        messages.append(userMsg)
        input = ""
        isStreaming = true
        errorMessage = nil

        streamTask?.cancel()
        streamTask = Task { await stream(history: messages) }
    }

    func cancel() {
        streamTask?.cancel()
        isStreaming = false
    }

    private func stream(history: [ChatMessage]) async {
        defer { isStreaming = false }
        do {
            let token = try await accessToken()
            var assistant = ChatMessage(role: .assistant, content: "")
            messages.append(assistant)
            let assistantIndex = messages.count - 1

            for try await chunk in client.stream(messages: history, skill: skill, accessToken: token) {
                assistant.content += chunk
                messages[assistantIndex] = assistant
            }
        } catch ChatStreamError.dailyLimitReached(let message) {
            errorMessage = message ?? "You've used all your free expert messages today. Upgrade to Flare+ for unlimited access."
            rollbackOnError()
        } catch ChatStreamError.notAuthenticated {
            errorMessage = "Your session expired. Please sign in again."
            rollbackOnError()
        } catch ChatStreamError.httpStatus(let code, let detail) {
            errorMessage = "Chat failed (HTTP \(code))" + (detail.map { ": \($0)" } ?? "")
            rollbackOnError()
        } catch is CancellationError {
            // user cancelled — leave partial assistant message in place
        } catch {
            errorMessage = error.localizedDescription
            rollbackOnError()
        }
    }

    private func rollbackOnError() {
        if let last = messages.last, last.role == .assistant, last.content.isEmpty {
            messages.removeLast()
        }
    }

    private func accessToken() async throws -> String {
        do {
            let session = try await SupabaseService.client.auth.session
            return session.accessToken
        } catch {
            throw ChatStreamError.notAuthenticated
        }
    }
}
