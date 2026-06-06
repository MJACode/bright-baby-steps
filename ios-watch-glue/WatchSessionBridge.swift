//
//  WatchSessionBridge.swift
//  Grace Flare — iOS side of the Apple Watch companion bridge.
//
//  Lives in the committed `ios-watch-glue/` dir (NOT in `ios/`, which CI wipes
//  and regenerates every build). `watch/project/inject_watch_target.rb` copies
//  this file into `ios/App/App/` and adds it to the App target during CI.
//
//  Responsibility: relay the web app's Supabase session (access + refresh token,
//  expiry, active child id) to the paired Apple Watch via
//  WCSession.updateApplicationContext. updateApplicationContext is used (not
//  sendMessage) because it queues the latest state for background delivery — the
//  watch receives the token even when the phone later backgrounds.
//
//  The watch writes logs directly to Supabase PostgREST using the relayed JWT,
//  so the phone does not need to perform writes on the watch's behalf in the
//  primary path. didReceiveUserInfo is a stub for a future relay-queue fallback.
//

import Foundation
import WatchConnectivity

final class WatchSessionBridge: NSObject, WCSessionDelegate {
    static let shared = WatchSessionBridge()

    // Latest context handed up from the web layer. Replayed on (re)activation.
    private var latestContext: [String: Any] = [:]

    /// Activate the WCSession. Called once from the Capacitor plugin's load().
    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Store + relay the current auth context to the watch.
    func push(accessToken: String, refreshToken: String, expiresAt: Double, childId: String?) {
        latestContext = [
            "accessToken": accessToken,
            "refreshToken": refreshToken,
            "expiresAt": expiresAt,
            // Empty string (not nil) so the dictionary stays plist-encodable.
            "childId": childId ?? "",
            "updatedAt": Date().timeIntervalSince1970,
        ]
        sendContext()
    }

    /// Clear the context on sign-out so the watch stops writing.
    func clear() {
        latestContext = [
            "cleared": true,
            "updatedAt": Date().timeIntervalSince1970,
        ]
        sendContext()
    }

    private func sendContext() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        do {
            try session.updateApplicationContext(latestContext)
        } catch {
            print("WatchSessionBridge: updateApplicationContext failed: \(error)")
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        if let error = error {
            print("WatchSessionBridge: activation error: \(error)")
        }
        // Replay the latest context once activated (covers the case where the
        // web layer pushed before WCSession finished activating).
        if activationState == .activated && !latestContext.isEmpty {
            sendContext()
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate to handle the watch being switched (Apple's documented dance).
        WCSession.default.activate()
    }

    /// Relay-queue fallback. The watch uses transferUserInfo to queue a log when
    /// it has no valid token yet. Groundwork stub: accept + log only. The actual
    /// forwarding write reusing the live web session is a later increment.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        print("WatchSessionBridge: received relay userInfo (write not yet implemented): \(userInfo)")
    }
}
