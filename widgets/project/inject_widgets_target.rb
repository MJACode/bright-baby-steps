#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject_widgets_target.rb
#
# Adds the GraceFlareWidgets extension (Live Activity lock-screen timers) and
# the iOS-side ActivityKit glue to the Capacitor-generated Xcode project.
#
# WHY THIS EXISTS: `ios/` is gitignored and regenerated on every CI build
# (`rm -rf ios/ && npx cap add ios`), so a widget target committed inside the
# project would be wiped. Same pattern as watch/project/inject_watch_target.rb:
# the extension sources live in `widgets/GraceFlareWidgets/`, the Capacitor
# plugin glue in `ios-live-activity-glue/`, and this script surgically wires
# them into the fresh `ios/App/App.xcodeproj` after `cap add ios` and before
# the version bump / build.
#
# Run from the repo root, after `npx cap add ios`:
#   ruby widgets/project/inject_widgets_target.rb
#
# Reads these env vars (exported by codemagic's "Set up code signing" step):
#   DEVELOPMENT_TEAM       Apple team id
#   WIDGETS_PROFILE_UUID   provisioning profile UUID for com.graceflare.app.widgets
# If unset, signing settings are left for xcodebuild to resolve (local dev).

require "xcodeproj"
require "fileutils"

REPO          = File.expand_path("../..", __dir__)
PROJECT       = File.join(REPO, "ios/App/App.xcodeproj")
APP_DIR       = File.join(REPO, "ios/App/App")
WIDGETS_SRC   = File.join(REPO, "widgets/GraceFlareWidgets")
GLUE_DIR      = File.join(REPO, "ios-live-activity-glue")
WIDGETS_PLIST = "../../widgets/project/Info-Widgets.plist" # relative to SRCROOT (ios/App)

WIDGETS_BUNDLE_ID = "com.graceflare.app.widgets"
# Live Activities need iOS 16.1. The extension's floor can sit above the host
# app's — on older iOS the extension simply never loads (Xcode warns, Apple
# accepts). App-side ActivityKit calls are #available(iOS 16.1, *)-guarded.
IOS_TARGET = "16.1"

# Compiled into BOTH the App target and the extension so ActivityKit can match
# the activity's attributes type across the process boundary.
SHARED_ATTRIBUTES = "TimerActivityAttributes.swift"

abort "Xcode project not found at #{PROJECT} — run `npx cap add ios` first." unless Dir.exist?(PROJECT)

team          = ENV["DEVELOPMENT_TEAM"]
widgets_prof  = ENV["WIDGETS_PROFILE_UUID"]

project = Xcodeproj::Project.open(PROJECT)
app_target = project.targets.find { |t| t.name == "App" }
abort "Could not find the 'App' target in #{PROJECT}" unless app_target

# --- 1. Copy + add the iOS-side plugin glue to the App target --------------
app_group = project.main_group.find_subpath("App", true)
Dir.glob(File.join(GLUE_DIR, "*.{swift,m}")).sort.each do |src|
  base = File.basename(src)
  FileUtils.cp(src, File.join(APP_DIR, base))
  ref = app_group.new_file(base) # path is relative to the App group (ios/App/App)
  app_target.add_file_references([ref]) # .swift/.m → compile sources phase
end

# --- 2. Create the widget-extension target ---------------------------------
widget_target = project.new_target(
  :app_extension, "GraceFlareWidgets", :ios, IOS_TARGET, nil, :swift
)

widget_target.build_configurations.each do |config|
  bs = config.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"]      = WIDGETS_BUNDLE_ID
  bs["PRODUCT_NAME"]                   = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"]                 = WIDGETS_PLIST
  bs["GENERATE_INFOPLIST_FILE"]        = "NO"
  bs["IPHONEOS_DEPLOYMENT_TARGET"]     = IOS_TARGET
  bs["SDKROOT"]                        = "iphoneos"
  bs["TARGETED_DEVICE_FAMILY"]         = "1,2"
  bs["SWIFT_VERSION"]                  = "5.0"
  # Embedded into the host app's PlugIns/ — must not surface as a second
  # top-level product in the archive (same reasoning as the watch target).
  bs["SKIP_INSTALL"]                   = "YES"
  bs["MARKETING_VERSION"]              = "1.0"
  bs["CURRENT_PROJECT_VERSION"]        = "1" # agvtool -all overwrites at build time
  bs["CODE_SIGN_STYLE"]                = "Manual"
  bs["DEVELOPMENT_TEAM"]               = team if team
  bs["PROVISIONING_PROFILE_SPECIFIER"] = widgets_prof if widgets_prof
end

# --- 3. Add widget sources; share the attributes file with the App target --
widgets_group = project.main_group.new_group("GraceFlareWidgets", WIDGETS_SRC)
Dir.glob(File.join(WIDGETS_SRC, "**/*.swift")).sort.each do |src|
  ref = widgets_group.new_file(src)
  widget_target.add_file_references([ref])
  # The ActivityAttributes type must exist identically on both sides of the
  # extension boundary — add the same file reference to the App target too.
  app_target.add_file_references([ref]) if File.basename(src) == SHARED_ATTRIBUTES
end

# --- 4. Make the App target depend on + embed the extension ----------------
app_target.add_dependency(widget_target)
embed = app_target.new_copy_files_build_phase("Embed App Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
build_file = embed.add_file_reference(widget_target.product_reference, true)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save
puts "Injected widget extension 'GraceFlareWidgets' (#{WIDGETS_BUNDLE_ID}) and Live Activity glue into #{PROJECT}."
