//
//  SupabaseAuth.swift
//  Holds the Supabase session relayed from the phone (access + refresh token,
//  expiry, active child id) and refreshes the access token on its own against
//  /auth/v1/token?grant_type=refresh_token.
//
//  Tokens are persisted in the Keychain so a relaunch of the watch app keeps
//  the session until the phone next pushes an update. parentId is decoded from
//  the access-token JWT `sub` claim — inserts require parent_id and we avoid a
//  round-trip by reading it from the token we already hold.
//
//  Refresh-token rotation: if Supabase rotates the refresh token on the phone,
//  our copy goes stale and refresh() throws .needsPhone. The phone re-pushes
//  context on every onAuthStateChange, so the watch recovers on the next sync;
//  until then the UI shows AuthStateView ("open Grace Flare on your phone").
//

import Foundation
import Combine

@MainActor
final class SupabaseAuth: ObservableObject {
    static let shared = SupabaseAuth()

    @Published private(set) var isAuthed = false
    @Published private(set) var childId: String?

    private var accessToken: String?
    private var refreshToken: String?
    private var expiresAt: Date = .distantPast

    enum AuthError: Error { case needsPhone, noChild }

    private init() {
        load()
    }

    // MARK: - Context from the phone

    /// Update from a WCSession applicationContext payload pushed by the phone.
    func updateFromContext(_ context: [String: Any]) {
        if context["cleared"] as? Bool == true {
            clear()
            return
        }
        guard let access = context["accessToken"] as? String,
              let refresh = context["refreshToken"] as? String else { return }
        accessToken = access
        refreshToken = refresh
        if let exp = context["expiresAt"] as? Double, exp > 0 {
            expiresAt = Date(timeIntervalSince1970: exp)
        }
        let cid = context["childId"] as? String
        childId = (cid?.isEmpty == false) ? cid : nil
        persist()
        isAuthed = (accessToken != nil)
    }

    func clear() {
        accessToken = nil
        refreshToken = nil
        expiresAt = .distantPast
        childId = nil
        isAuthed = false
        Keychain.delete("gf_watch_session")
    }

    // MARK: - Token access

    /// Returns a valid access token, refreshing if it's expired or within 60s
    /// of expiry. Throws .needsPhone if there's no refresh token or refresh fails.
    func validAccessToken() async throws -> String {
        guard let token = accessToken, refreshToken != nil else {
            throw AuthError.needsPhone
        }
        if Date() < expiresAt.addingTimeInterval(-60) {
            return token
        }
        return try await refresh()
    }

    /// The parent's user id, decoded from the access-token JWT `sub` claim.
    func parentId() -> String? {
        guard let token = accessToken else { return nil }
        return Self.decodeJWTSub(token)
    }

    // MARK: - Refresh

    @discardableResult
    private func refresh() async throws -> String {
        guard let refresh = refreshToken else { throw AuthError.needsPhone }
        var req = URLRequest(url: SupabaseConfig.authURL
            .appendingPathComponent("token"))
        req.url = URL(string: SupabaseConfig.authURL
            .appendingPathComponent("token").absoluteString + "?grant_type=refresh_token")
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": refresh])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let newAccess = json["access_token"] as? String,
              let newRefresh = json["refresh_token"] as? String else {
            // Most often a 400 from a rotated/stale refresh token.
            clear()
            throw AuthError.needsPhone
        }
        accessToken = newAccess
        refreshToken = newRefresh
        if let expiresIn = json["expires_in"] as? Double {
            expiresAt = Date().addingTimeInterval(expiresIn)
        } else if let exp = json["expires_at"] as? Double {
            expiresAt = Date(timeIntervalSince1970: exp)
        }
        persist()
        isAuthed = true
        return newAccess
    }

    // MARK: - Persistence

    private func persist() {
        let payload: [String: Any] = [
            "accessToken": accessToken ?? "",
            "refreshToken": refreshToken ?? "",
            "expiresAt": expiresAt.timeIntervalSince1970,
            "childId": childId ?? "",
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            Keychain.set(data, for: "gf_watch_session")
        }
    }

    private func load() {
        guard let data = Keychain.get("gf_watch_session"),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        accessToken = (json["accessToken"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        refreshToken = (json["refreshToken"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        if let exp = json["expiresAt"] as? Double { expiresAt = Date(timeIntervalSince1970: exp) }
        childId = (json["childId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        isAuthed = (accessToken != nil)
    }

    // MARK: - JWT

    /// Decodes the `sub` claim from a JWT without verifying the signature
    /// (we only need the user id; the server enforces auth via the signature).
    static func decodeJWTSub(_ jwt: String) -> String? {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        // Pad to a multiple of 4 for base64 decoding.
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json["sub"] as? String
    }
}
