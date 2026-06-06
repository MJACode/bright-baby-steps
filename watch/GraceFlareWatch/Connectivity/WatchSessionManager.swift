//
//  WatchSessionManager.swift
//  Watch-side WCSession delegate. Receives the auth context the phone pushes via
//  updateApplicationContext and feeds it into SupabaseAuth. Activated once at
//  app launch (see GraceFlareWatchApp).
//
//  Outbound relay fallback (queueRelay) is provided for the case where the watch
//  has no valid token yet — it queues a log via transferUserInfo for the phone
//  to write. The primary path is direct PostgREST writes from the watch; the
//  phone-side handler is a stub for groundwork (see ios-watch-glue).
//

import Foundation
import WatchConnectivity

final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Queue a log for the phone to write when the watch can't write directly.
    func queueRelay(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        WCSession.default.transferUserInfo(payload)
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        // On activation, adopt whatever context the phone last set.
        let context = session.receivedApplicationContext
        if !context.isEmpty {
            Task { @MainActor in SupabaseAuth.shared.updateFromContext(context) }
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in SupabaseAuth.shared.updateFromContext(applicationContext) }
    }
}
