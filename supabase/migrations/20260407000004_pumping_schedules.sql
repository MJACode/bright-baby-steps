-- Pumping schedule for mothers who need to pump on a regular interval
-- Actual pump sessions are stored in feeding_logs (feeding_type = 'pump'),
-- so this table only holds the schedule definition.

CREATE TABLE public.pumping_schedules (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid          NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id     uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  frequency_hours numeric(4,1) NOT NULL DEFAULT 3,   -- e.g. 2.5 = every 2h 30m
  day_start_time  time        NOT NULL DEFAULT '06:00', -- first session of day
  day_end_time    time        NOT NULL DEFAULT '22:00', -- no new sessions after this
  is_active                  boolean  NOT NULL DEFAULT true,
  pump_notifications_enabled boolean  NOT NULL DEFAULT true,  -- mobile: schedule local notifications
  notes                      text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.pumping_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pumping schedules"
  ON public.pumping_schedules
  FOR ALL
  USING (auth.uid() = parent_id)
  WITH CHECK (auth.uid() = parent_id);
