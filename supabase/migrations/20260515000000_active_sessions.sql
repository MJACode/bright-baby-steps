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

-- One active feed per child across all devices. "Active" = duration_minutes IS NULL
-- (feeding_logs has no ended_at column; logged_at carries the start time while
-- a session is in-progress, and duration_minutes is filled in on Stop).
CREATE UNIQUE INDEX IF NOT EXISTS one_active_feed_per_child
  ON public.feeding_logs (child_id)
  WHERE duration_minutes IS NULL;

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
