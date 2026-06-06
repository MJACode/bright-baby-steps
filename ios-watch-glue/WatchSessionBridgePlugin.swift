//
//  WatchSessionBridgePlugin.swift
//  Grace Flare — Capacitor plugin exposing the watch bridge to the web layer.
//
//  JS calls `WatchSessionBridge.pushWatchContext({...})` (see
//  `src/integrations/watch/watchBridge.ts`); this forwards to the native
//  WCSession manager. Activates WCSession on plugin load so the session is live
//  before the first push.
//
//  Injected into `ios/App/App/` + added to the App target by
//  `watch/project/inject_watch_target.rb` during CI.
//

import Foundation
import Capacitor

@objc(WatchSessionBridgePlugin)
public class WatchSessionBridgePlugin: CAPPlugin {

    override public func load() {
        WatchSessionBridge.shared.activate()
    }

    @objc func pushWatchContext(_ call: CAPPluginCall) {
        guard let accessToken = call.getString("accessToken"),
              let refreshToken = call.getString("refreshToken") else {
            call.reject("Missing accessToken/refreshToken")
            return
        }
        let expiresAt = call.getDouble("expiresAt") ?? 0
        let childId = call.getString("childId")
        WatchSessionBridge.shared.push(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            childId: childId
        )
        call.resolve()
    }

    @objc func clearWatchContext(_ call: CAPPluginCall) {
        WatchSessionBridge.shared.clear()
        call.resolve()
    }
}
