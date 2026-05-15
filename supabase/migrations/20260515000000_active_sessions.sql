-- Active-session persistence for sleep, nursing, bottle and pump timers.
--
-- Before this change, in-progress timers lived only in React component state, so
-- closing the app lost the entry. The hooks useActiveSleep / useActiveFeed now
-- INSERT a row immediately on Start (ended_at / duration_minutes NULL while
-- in-progress) and UPDATE it on Stop, so reopening the app re-hydrates the timer
-- from the server.
--
-- The partial unique indexes below prevent two devices (parent + partner) from
-- both creating an active row for the same child and then hitting the
-- no_overlapping_sleep exclusion constraint on commit. The pause/resume
-- columns on sleep_logs preserve pause state across reload without client state.

-- One active sleep per child across all devices.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_sleep_per_child
  ON public.sleep_logs (child_id)
  WHERE ended_at IS NULL;

-- One active feed per child across all devices. "Active" = a timer-started row
-- (source='timer') with duration_minutes still NULL. Scoping the predicate to
-- source='timer' is critical: solid feeds and bottle feeds without a recorded
-- duration also use NULL legitimately, so a plain "duration_minutes IS NULL"
-- index would (a) fail to create against existing manual rows and (b) surface
-- those rows as "active" in useActiveFeed.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_feed_per_child
  ON public.feeding_logs (child_id)
  WHERE duration_minutes IS NULL AND source = 'timer';

-- Pause / resume state preserved server-side so reload survives without
-- bespoke client state. paused_at NULL means "currently running".
ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS paused_accumulated_seconds integer NOT NULL DEFAULT 0;

-- For nursing / pumping: which side is currently running. NULL = neither side
-- active (paused, or bottle/pump-without-side). Side switches flush the
-- elapsed seconds to duration_minutes_left / duration_minutes_right.
-- side_started_at marks when the current segment began so reload can compute
-- elapsed seconds for the in-progress side without losing them.
ALTER TABLE public.feeding_logs
  ADD COLUMN IF NOT EXISTS active_side text NULL
    CHECK (active_side IS NULL OR active_side IN ('left', 'right')),
  ADD COLUMN IF NOT EXISTS side_started_at timestamptz NULL;

-- Extend the source allowlist to include 'timer'. The original allowlist
-- (migration 20260429020000_log_source) predates the timer-start flow added
-- by useActiveFeed / useActiveSleep, which insert source='timer' on session
-- start. Without this, every Start-timer INSERT throws a CHECK violation.
ALTER TABLE public.feeding_logs DROP CONSTRAINT IF EXISTS feeding_logs_source_check;
ALTER TABLE public.feeding_logs ADD CONSTRAINT feeding_logs_source_check
  CHECK (source IN ('manual', 'voice', 'photo', 'watch', 'import', 'timer'));

ALTER TABLE public.sleep_logs DROP CONSTRAINT IF EXISTS sleep_logs_source_check;
ALTER TABLE public.sleep_logs ADD CONSTRAINT sleep_logs_source_check
  CHECK (source IN ('manual', 'voice', 'photo', 'watch', 'import', 'timer'));
