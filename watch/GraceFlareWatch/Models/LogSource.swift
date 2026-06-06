//
//  LogSource.swift
//  Mirrors the `source` CHECK constraint on the log tables (see
//  supabase/migrations/20260429020000_log_source.sql and
//  20260515000000_active_sessions.sql).
//
//  IMPORTANT: watch-started *timers* must use `.timer` (not `.watch`) so they
//  share the phone's "one active session per child" partial unique index and
//  surface in useActiveFeed/useActiveSleep. Quick taps + diaper logs use
//  `.watch` so watch-originated rows are identifiable.
//

import Foundation

enum LogSource: String {
    case manual
    case voice
    case photo
    case watch
    case importSource = "import"
    case timer
}
