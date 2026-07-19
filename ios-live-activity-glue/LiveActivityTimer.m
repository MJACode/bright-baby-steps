//
//  LiveActivityTimer.m
//  Grace Flare — Capacitor plugin registration for LiveActivityTimerPlugin.
//
//  The CAP_PLUGIN macro registers the Swift plugin with Capacitor's bridge and
//  declares the JS-callable methods. The plugin JS name ("LiveActivityTimer")
//  must match registerPlugin<...>("LiveActivityTimer") in
//  src/integrations/liveActivity/liveActivityClient.ts.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivityTimerPlugin, "LiveActivityTimer",
    CAP_PLUGIN_METHOD(startTimerActivity, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(updateTimerActivity, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(endTimerActivity, CAPPluginReturnPromise);
)
