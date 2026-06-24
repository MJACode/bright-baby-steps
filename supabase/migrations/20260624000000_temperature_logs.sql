-- Temperature (fever) tracking.
--
-- Parents need a point-in-time vitals log, especially during illness when a
-- pediatrician asks for a timeline of readings. The existing illness_logs /
-- medication_logs tables don't capture repeated, timestamped measurements, so
-- temperature gets its own table — modeled on weight_logs (numeric measurement)
-- and illness_logs (RLS with partner access via has_partner_access()).
--
-- child_id is ON DELETE CASCADE, so these rows are purged transitively by
-- _purge_user_data()'s `DELETE FROM children` (same as illness_logs,
-- weight_logs, etc.) — no change to the purge helper is required.

CREATE TABLE IF NOT EXISTS public.temperature_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  temp_value numeric NOT NULL,
  unit text NOT NULL DEFAULT 'F' CHECK (unit IN ('F', 'C')),
  method text,                       -- oral | rectal | axillary | forehead | ear (nullable)
  taken_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  source text,                       -- 'manual' | 'voice' (audit trail, matches diaper_logs/feeding_logs)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own temperature logs" ON public.temperature_logs
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

CREATE TRIGGER update_temperature_logs_updated_at
  BEFORE UPDATE ON public.temperature_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_temperature_logs_child_taken
  ON public.temperature_logs(child_id, taken_at DESC);
