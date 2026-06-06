//
//  SupabaseREST.swift
//  Direct PostgREST client for the watch. Writes rows to the same tables and
//  with the same payload shapes the web app uses (see useActiveFeed.tsx,
//  useActiveSleep.tsx, QuickLogFAB.tsx), under the parent's own JWT so RLS
//  (parent_id = auth.uid()) applies identically.
//
//  The anon/publishable key below is the SAME public key embedded in
//  src/integrations/supabase/client.ts — it is safe to ship in the binary; RLS
//  + the per-user bearer token are what protect data.
//

import Foundation

enum SupabaseConfig {
    static let baseURL = URL(string: "https://ieuznbvvwdvhtirzwkly.supabase.co")!
    static var restURL: URL { baseURL.appendingPathComponent("rest/v1") }
    static var authURL: URL { baseURL.appendingPathComponent("auth/v1") }
    // Public anon (publishable) JWT — identical to the web client's key.
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldXpuYnZ2d2R2aHRpcnp3a2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTIzODQsImV4cCI6MjA4ODU2ODM4NH0.04dxqjtlwWujfWTSM8fm2Y6EXGqIpOZisvBcN4eETEc"
}

struct SupabaseREST {
    let auth: SupabaseAuth

    enum RESTError: Error {
        case http(Int, String)
        case noToken
    }

    /// Insert a row and return the created row's `id` (Prefer: return=representation).
    @discardableResult
    func insert(table: String, row: [String: Any]) async throws -> String? {
        let token = try await auth.validAccessToken()
        var req = URLRequest(url: SupabaseConfig.restURL.appendingPathComponent(table))
        req.httpMethod = "POST"
        applyHeaders(&req, token: token)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        req.httpBody = try JSONSerialization.data(withJSONObject: [row])

        let (data, response) = try await URLSession.shared.data(for: req)
        try Self.check(response, data)
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
           let first = arr.first {
            return first["id"] as? String
        }
        return nil
    }

    /// PATCH a row by id (used to stop a timer: set ended_at / duration_minutes).
    func update(table: String, id: String, changes: [String: Any]) async throws {
        let token = try await auth.validAccessToken()
        let url = SupabaseConfig.restURL.appendingPathComponent(table)
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "PATCH"
        applyHeaders(&req, token: token)
        req.httpBody = try JSONSerialization.data(withJSONObject: changes)

        let (data, response) = try await URLSession.shared.data(for: req)
        try Self.check(response, data)
    }

    /// Fetch the single active timer for a child (source='timer', open end), or nil.
    func activeSession(table: String, childId: String, openField: String) async throws -> [String: Any]? {
        let token = try await auth.validAccessToken()
        let url = SupabaseConfig.restURL.appendingPathComponent(table)
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "child_id", value: "eq.\(childId)"),
            URLQueryItem(name: "source", value: "eq.timer"),
            URLQueryItem(name: openField, value: "is.null"),
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "limit", value: "1"),
        ]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        applyHeaders(&req, token: token)

        let (data, response) = try await URLSession.shared.data(for: req)
        try Self.check(response, data)
        let arr = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        return arr?.first
    }

    // MARK: - Helpers

    private func applyHeaders(_ req: inout URLRequest, token: String) {
        req.setValue(SupabaseConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw RESTError.http(http.statusCode, body)
        }
    }
}
