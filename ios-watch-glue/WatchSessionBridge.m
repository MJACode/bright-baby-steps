//
//  WatchSessionBridge.m
//  Grace Flare — Capacitor plugin registration for WatchSessionBridgePlugin.
//
//  The CAP_PLUGIN macro registers the Swift plugin with Capacitor's bridge and
//  declares the JS-callable methods. The plugin JS name ("WatchSessionBridge")
//  must match registerPlugin<...>("WatchSessionBridge") in watchBridge.ts.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchSessionBridgePlugin, "WatchSessionBridge",
    CAP_PLUGIN_METHOD(pushWatchContext, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clearWatchContext, CAPPluginReturnPromise);
)
