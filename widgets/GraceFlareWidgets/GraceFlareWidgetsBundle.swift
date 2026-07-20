//
//  GraceFlareWidgetsBundle.swift
//  Grace Flare — entry point for the widget extension.
//
//  Currently the bundle only hosts the timer Live Activity. Home-screen
//  widgets can be added here later without another target.
//

import WidgetKit
import SwiftUI

@main
struct GraceFlareWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TimerLiveActivity()
    }
}
