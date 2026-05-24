-- Manual doctor-visit calendar (one row per upcoming pediatric appointment).
--
-- Complements the existing `pediatrician_visits` table, which stores LOGGED /
-- COMPLETED visits with provider notes and findings. This table is the
-- forward-looking schedule that powers:
--   - The "Upcoming visits" section in `MedicalTab.tsx`
--   - 7-day + 1-day in-app reminders (notifications.type = 'appointment_reminder')
--   - Opt-in 7-day + 1-day email reminders (via send-visit-reminder-email)
--   - The dashboard `VisitPrepCard` countdown (preferred over the legacy
--     `children.next_appointment` text field when both are set)
--
-- Status lifecycle: a row is born 'scheduled'. The parent can mark it
-- 'completed' (typically also creating a `pediatrician_visits` row for the
-- after-visit notes), 'cancelled', or it may auto-transition to 'missed' in a
-- later cleanup pass (out of scope for this migration). Only 'scheduled' rows
-- are scanned by the cron reminder loop.
--
-- Reminder dedupe: `reminder_7d_sent_at` and `reminder_1d_sent_at` are stamped
-- by the cron once each. The cron's in-memory 3-hour `recentTypes` set
-- additionally prevents same-run double-fires on the rare case where a row's
-- scheduled_at sits exactly on the 7-day or 1-day boundary across two ticks.
--
-- Deletion path:
--   - `child_id ... ON DELETE CASCADE` purges when the child is deleted
--   - `parent_id ... ON DELETE CASCADE` purges when the auth user is deleted
-- Both cascade through `_purge_user_data()` (the canonical helper since
-- 20260509000000_*) without needing an explicit DELETE: the `parent_id ->
-- auth.users(id) ON DELETE CASCADE` chain fires from `DELETE FROM auth.users`
-- at the end of that function. Per lesson 2026-05-07, every parent_id-
-- referencing table is documented here even when the cascade covers it; if a
-- future schema change removes the cascade, an explicit DELETE belongs in
-- `_purge_user_data()` before the children/profiles deletes.

CREATE TABLE IF NOT EXISTS public.scheduled_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  scheduled_at timestamptz NOT NULL,
  visit_type text NOT NULL,                    -- 'well' | 'sick' | 'specialist' | 'follow_up' | 'other'
  doctor_name text,
  location text,
  notes text,

  status text NOT NULL DEFAULT 'scheduled',    -- 'scheduled' | 'completed' | 'cancelled' | 'missed'

  email_reminders_enabled boolean NOT NULL DEFAULT false,
  reminder_7d_sent_at timestamptz,
  reminder_1d_sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scheduled_visits_visit_type_check
    CHECK (visit_type IN ('well', 'sick', 'specialist', 'follow_up', 'other')),
  CONSTRAINT scheduled_visits_status_check
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed'))
);

-- Primary list view: "all upcoming visits for this child, soonest first".
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_child_scheduled_at
  ON public.scheduled_visits (child_id, scheduled_at);

-- Cron scan: "all scheduled visits in the next N days across all users".
-- Partial index keeps the hot path tiny (cancelled/completed/missed are pruned).
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_scan
  ON public.scheduled_visits (scheduled_at)
  WHERE status = 'scheduled';

-- Reuse the existing public.update_updated_at() helper
-- (defined in 20260322213259_*.sql; same trigger pattern as sleep_plans).
DROP TRIGGER IF EXISTS update_scheduled_visits_updated_at ON public.scheduled_visits;
CREATE TRIGGER update_scheduled_visits_updated_at
  BEFORE UPDATE ON public.scheduled_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.scheduled_visits ENABLE ROW LEVEL SECURITY;

-- RLS pattern mirrors sleep_plans / sleep_logs / feeding_logs / diaper_logs
-- after the 20260501010000_harden_partner_role_rls.sql split:
--   SELECT  → has_partner_access (any active partner, including read-only viewers)
--   INSERT  → partner_can_write (owner, coparent, caregiver only)
--   UPDATE  → partner_can_write
--   DELETE  → partner_can_write

DROP POLICY IF EXISTS scheduled_visits_select ON public.scheduled_visits;
CREATE POLICY scheduled_visits_select
  ON public.scheduled_visits
  FOR SELECT
  USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

DROP POLICY IF EXISTS scheduled_visits_insert ON public.scheduled_visits;
CREATE POLICY scheduled_visits_insert
  ON public.scheduled_visits
  FOR INSERT
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS scheduled_visits_update ON public.scheduled_visits;
CREATE POLICY scheduled_visits_update
  ON public.scheduled_visits
  FOR UPDATE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id))
  WITH CHECK (auth.uid() = parent_id OR public.partner_can_write(parent_id));

DROP POLICY IF EXISTS scheduled_visits_delete ON public.scheduled_visits;
CREATE POLICY scheduled_visits_delete
  ON public.scheduled_visits
  FOR DELETE
  USING (auth.uid() = parent_id OR public.partner_can_write(parent_id));

COMMENT ON TABLE public.scheduled_visits IS
  'Forward-looking pediatric-appointment calendar. One row per upcoming visit. '
  'Cron-scanned by check-notifications for 7-day and 1-day reminders. '
  'Cascade-deleted with children or auth.users — covered transitively by '
  '_purge_user_data() (defined in 20260509000000_*) via DELETE FROM auth.users.';
