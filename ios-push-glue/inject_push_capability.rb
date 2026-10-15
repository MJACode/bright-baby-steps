#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject_push_capability.rb
#
# Wires APNs push into the Capacitor-generated App target. ios/ is gitignored
# and regenerated every CI build (`rm -rf ios/ && npx cap add ios`), so — same
# pattern as widgets/project/inject_widgets_target.rb — the pieces live here
# and are added to the fresh ios/App/App.xcodeproj after `cap add ios`.
#
#   1. AppDelegate+Push.swift → App target sources (always). Forwards the
#      device token to @capacitor/push-notifications.
#   2. App.entitlements (aps-environment = production) → App target's
#      CODE_SIGN_ENTITLEMENTS — only with --entitlement. Signing fails if the
#      entitlement is present but the provisioning profile lacks it, so
#      codemagic passes the flag only after confirming the App Store profile
#      carries aps-environment (i.e. Push is enabled on the App ID).
#
# Alert pushes only: no UIBackgroundModes / remote-notification is added.
#
# Run from the repo root, after `npx cap add ios`:
#   ruby ios-push-glue/inject_push_capability.rb [--entitlement]

require "xcodeproj"
require "fileutils"

REPO     = File.expand_path("..", __dir__)
PROJECT  = File.join(REPO, "ios/App/App.xcodeproj")
APP_DIR  = File.join(REPO, "ios/App/App")
GLUE_DIR = __dir__

abort "Xcode project not found at #{PROJECT} — run `npx cap add ios` first." unless Dir.exist?(PROJECT)

with_entitlement = ARGV.include?("--entitlement")

project = Xcodeproj::Project.open(PROJECT)
app_target = project.targets.find { |t| t.name == "App" }
abort "Could not find the 'App' target in #{PROJECT}" unless app_target

app_group = project.main_group.find_subpath("App", true)

swift = "AppDelegate+Push.swift"
FileUtils.cp(File.join(GLUE_DIR, swift), File.join(APP_DIR, swift))
app_target.add_file_references([app_group.new_file(swift)])

if with_entitlement
  FileUtils.cp(File.join(GLUE_DIR, "App.entitlements"), File.join(APP_DIR, "App.entitlements"))
  app_group.new_file("App.entitlements")
  app_target.build_configurations.each do |config|
    config.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements" # relative to SRCROOT (ios/App)
  end
end

project.save
puts "Injected push glue#{with_entitlement ? ' + aps-environment entitlement' : ' (no entitlement)'} into #{PROJECT}."
