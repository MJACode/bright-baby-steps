import UIKit
import Capacitor

// Forwards the APNs device token to @capacitor/push-notifications. The
// Capacitor template's AppDelegate.swift doesn't implement these, and ios/ is
// regenerated on every CI build, so they live here as an extension that
// ios-push-glue/inject_push_capability.rb adds to the App target.
extension AppDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
