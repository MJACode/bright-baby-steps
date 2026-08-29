-- Second-precision per-side accumulators for the nursing / pump / bottle timers.
--
-- Pausing a feed flushed the running segment into duration_minutes_left /
-- duration_minutes_right, which are integer MINUTES. A pause at 12:16 stored 12
-- and the face restarted from 12:00 on resume — every pause silently threw away
-- (or invented) up to 30 seconds, and a feed with several switches drifted by
-- minutes. Sleep already accumulates in seconds (paused_accumulated_seconds);
-- these columns give feeds the same precision.
--
-- The minute columns stay authoritative for finished rows: every reader
-- (exports, analytics, the Apple Watch, older app builds) keeps working, and
-- the timer writes both on each flush. Existing in-flight rows have NULL here,
-- so the client falls back to minutes * 60 for them.
ALTER TABLE public.feeding_logs
  ADD COLUMN IF NOT EXISTS duration_seconds_left integer,
  ADD COLUMN IF NOT EXISTS duration_seconds_right integer;

COMMENT ON COLUMN public.feeding_logs.duration_seconds_left IS
  'Exact accumulated seconds on the left side. Written by the timer alongside duration_minutes_left so pause/resume does not round. NULL on rows written before second precision — read as duration_minutes_left * 60.';
COMMENT ON COLUMN public.feeding_logs.duration_seconds_right IS
  'Exact accumulated seconds on the right side. See duration_seconds_left.';
