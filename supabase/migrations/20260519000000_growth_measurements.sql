-- Extend weight_logs to track length and head circumference alongside weight.
-- Each row now represents a "growth measurement" entry where any subset of
-- the three metrics may be present. A check constraint ensures at least one
-- measurement is recorded per row.

ALTER TABLE public.weight_logs
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS head_circumference_cm numeric;

ALTER TABLE public.weight_logs
  ALTER COLUMN weight_oz DROP NOT NULL;

ALTER TABLE public.weight_logs
  DROP CONSTRAINT IF EXISTS weight_logs_has_measurement;

ALTER TABLE public.weight_logs
  ADD CONSTRAINT weight_logs_has_measurement
  CHECK (
    weight_oz IS NOT NULL
    OR length_cm IS NOT NULL
    OR head_circumference_cm IS NOT NULL
  );
