#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject_watch_target.rb
#
# Adds the Grace Flare watchOS companion (single SwiftUI App target) and the
# iOS-side WatchConnectivity glue to the Capacitor-generated Xcode project.
#
# WHY THIS EXISTS: `ios/` is gitignored and regenerated on every CI build
# (`rm -rf ios/ && npx cap add ios`), so a watch target committed inside the
# project would be wiped. The watch sources live in `watch/GraceFlareWatch/`
# and the glue in `ios-watch-glue/`; this script surgically wires them into the
# fresh `ios/App/App.xcodeproj` after `cap add ios` and before signing/build.
#
# Run from the repo root, after `npx cap add ios`:
#   ruby watch/project/inject_watch_target.rb
#
# Reads these env vars (exported by codemagic's "Set up code signing" step):
#   DEVELOPMENT_TEAM      Apple team id
#   IOS_PROFILE_UUID      provisioning profile UUID for com.graceflare.app
#   WATCH_PROFILE_UUID    provisioning profile UUID for com.graceflare.app.watchkitapp
# If unset, signing settings are left for xcodebuild to resolve (local dev).

require "xcodeproj"
require "fileutils"

REPO        = File.expand_path("../..", __dir__)
PROJECT     = File.join(REPO, "ios/App/App.xcodeproj")
APP_DIR     = File.join(REPO, "ios/App/App")
WATCH_SRC   = File.join(REPO, "watch/GraceFlareWatch")
GLUE_DIR    = File.join(REPO, "ios-watch-glue")
WATCH_PLIST = "../../watch/project/Info-WatchApp.plist" # relative to SRCROOT (ios/App)
ICON_MASTER = File.join(REPO, "assets/ios/AppIcon.appiconset/AppIcon-512@2x.png")
ICON_DEST   = File.join(WATCH_SRC, "Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")

WATCH_BUNDLE_ID  = "com.graceflare.app.watchkitapp"
APP_BUNDLE_ID    = "com.graceflare.app"
WATCHOS_TARGET   = "9.0"

abort "Xcode project not found at #{PROJECT} — run `npx cap add ios` first." unless Dir.exist?(PROJECT)

team        = ENV["DEVELOPMENT_TEAM"]
ios_profile = ENV["IOS_PROFILE_UUID"]
watch_prof  = ENV["WATCH_PROFILE_UUID"]

# 1024 watch icon: reuse the iOS 1024 master so the catalog has a real file.
if File.exist?(ICON_MASTER)
  FileUtils.cp(ICON_MASTER, ICON_DEST)
else
  warn "WARNING: #{ICON_MASTER} missing — watch AppIcon will be empty."
end

project = Xcodeproj::Project.open(PROJECT)
app_target = project.targets.find { |t| t.name == "App" }
abort "Could not find the 'App' target in #{PROJECT}" unless app_target

# --- 1. Copy + add the iOS-side glue to the App target --------------------
app_group = project.main_group.find_subpath("App", true)
Dir.glob(File.join(GLUE_DIR, "*.{swift,m}")).sort.each do |src|
  base = File.basename(src)
  FileUtils.cp(src, File.join(APP_DIR, base))
  ref = app_group.new_file(base) # path is relative to the App group (ios/App/App)
  app_target.add_file_references([ref]) # .swift/.m → compile sources phase
end

# --- 2. Create the watchOS App target -------------------------------------
watch_target = project.new_target(
  :application, "GraceFlareWatch", :watchos, WATCHOS_TARGET, nil, :swift
)

# Build settings shared across Debug/Release.
watch_target.build_configurations.each do |config|
  bs = config.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"]        = WATCH_BUNDLE_ID
  bs["PRODUCT_NAME"]                     = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"]                   = WATCH_PLIST
  bs["GENERATE_INFOPLIST_FILE"]          = "NO"
  bs["WATCHOS_DEPLOYMENT_TARGET"]        = WATCHOS_TARGET
  bs["SDKROOT"]                          = "watchos"
  bs["TARGETED_DEVICE_FAMILY"]           = "4" # Apple Watch
  bs["SWIFT_VERSION"]                    = "5.0"
  bs["ASSETCATALOG_COMPILER_APPICON_NAME"] = "AppIcon"
  bs["SKIP_INSTALL"]                     = "NO"
  bs["MARKETING_VERSION"]                = "1.0"
  bs["CURRENT_PROJECT_VERSION"]          = "1" # agvtool -all overwrites at build time
  bs["CODE_SIGN_STYLE"]                  = "Manual"
  bs["DEVELOPMENT_TEAM"]                 = team if team
  bs["PROVISIONING_PROFILE_SPECIFIER"]   = watch_prof if watch_prof
end

# --- 3. Add watch sources + asset catalog to the watch target -------------
watch_group = project.main_group.new_group("GraceFlareWatch", WATCH_SRC)
Dir.glob(File.join(WATCH_SRC, "**/*.swift")).sort.each do |src|
  ref = watch_group.new_file(src)
  watch_target.add_file_references([ref])
end
xcassets = File.join(WATCH_SRC, "Resources/Assets.xcassets")
if Dir.exist?(xcassets)
  asset_ref = watch_group.new_file(xcassets)
  watch_target.add_resources([asset_ref])
end

# --- 4. Make the App target depend on + embed the watch app ---------------
app_target.add_dependency(watch_target)
embed = app_target.new_copy_files_build_phase("Embed Watch Content")
embed.symbol_dst_subfolder_spec = :products_directory
embed.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
build_file = embed.add_file_reference(watch_target.product_reference, true)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

# --- 5. Re-assert manual signing on the App target ------------------------
# `xcode-project use-profiles` only partially applies on SPM layouts; pin the
# App target's signing here so both targets are explicit before build.
if team || ios_profile
  app_target.build_configurations.each do |config|
    bs = config.build_settings
    bs["CODE_SIGN_STYLE"]                = "Manual"
    bs["DEVELOPMENT_TEAM"]               = team if team
    bs["PROVISIONING_PROFILE_SPECIFIER"] = ios_profile if ios_profile
  end
end

project.save
puts "Injected watchOS target 'GraceFlareWatch' (#{WATCH_BUNDLE_ID}) and iOS glue into #{PROJECT}."
