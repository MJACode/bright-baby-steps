-- Pump and bottle timer inserts were silently rejected at the DB level because
-- the feeding_type CHECK never included 'bottle' or 'pump'. Widen it.
ALTER TABLE public.feeding_logs DROP CONSTRAINT IF EXISTS feeding_logs_feeding_type_check;
ALTER TABLE public.feeding_logs
  ADD CONSTRAINT feeding_logs_feeding_type_check
  CHECK (feeding_type = ANY (ARRAY[
    'breast'::text,
    'bottle'::text,
    'bottle_breast_milk'::text,
    'bottle_formula'::text,
    'pump'::text,
    'solid'::text,
    'combination'::text
  ]));

-- New "Both" button in PumpTimer sets active_side='both' to indicate parallel
-- double-pumping. The CHECK previously only allowed left/right/NULL.
ALTER TABLE public.feeding_logs DROP CONSTRAINT IF EXISTS feeding_logs_active_side_check;
ALTER TABLE public.feeding_logs
  ADD CONSTRAINT feeding_logs_active_side_check
  CHECK ((active_side IS NULL) OR (active_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])));
