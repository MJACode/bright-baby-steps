import Foundation

// Mirrors src/components/AIChatWidget.tsx lines 219-284 in the web app.
// The chat edge function emits OpenAI-style SSE: lines beginning with
// "data: " carry a JSON payload whose `choices[0].delta.content` field
// holds the next chunk of assistant text. A "data: [DONE]" line terminates
// the stream. Comment lines starting with ":" and blank lines are ignored.

struct ChatMessage: Codable, Identifiable, Equatable {
    enum Role: String, Codable { case user, assistant, system }
    let id: UUID
    let role: Role
    var content: String

    init(id: UUID = UUID(), role: Role, content: String) {
        self.id = id
        self.role = role
        self.content = content
    }

    private enum CodingKeys: String, CodingKey { case role, content }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = UUID()
        role = try c.decode(Role.self, forKey: .role)
        content = try c.decode(String.self, forKey: .content)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(role, forKey: .role)
        try c.encode(content, forKey: .content)
    }
}

enum ChatStreamError: Error {
    case notAuthenticated
    case httpStatus(Int, String?)
    case dailyLimitReached(String?)
    case decoding
}

struct ChatStreamClient {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = SupabaseConfig.url, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /// Streams assistant deltas for a chat turn. Yields each new content chunk
    /// as it arrives; throws on auth or HTTP errors.
    func stream(messages: [ChatMessage], skill: String, accessToken: String) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: baseURL.appendingPathComponent("functions/v1/chat"))
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
                    let body: [String: Any] = [
                        "messages": messages.map { ["role": $0.role.rawValue, "content": $0.content] },
                        "skill": skill
                    ]
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw ChatStreamError.httpStatus(0, nil)
                    }
                    guard (200..<300).contains(http.statusCode) else {
                        // Drain the body so we can surface the JSON error payload.
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                        let errorCode = payload?["error"] as? String
                        let message = payload?["message"] as? String
                        if http.statusCode == 429, errorCode == "daily_limit_reached" {
                            throw ChatStreamError.dailyLimitReached(message)
                        }
                        throw ChatStreamError.httpStatus(http.statusCode, message ?? errorCode)
                    }

                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        let trimmed = line.hasSuffix("\r") ? String(line.dropLast()) : line
                        if trimmed.isEmpty || trimmed.hasPrefix(":") { continue }
                        guard trimmed.hasPrefix("data: ") else { continue }
                        let payload = String(trimmed.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                        if payload == "[DONE]" { break }
                        guard
                            let data = payload.data(using: .utf8),
                            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                            let choices = json["choices"] as? [[String: Any]],
                            let delta = choices.first?["delta"] as? [String: Any],
                            let content = delta["content"] as? String,
                            !content.isEmpty
                        else { continue }
                        continuation.yield(content)
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
