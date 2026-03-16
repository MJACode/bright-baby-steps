ALTER TABLE public.feeding_logs 
  ADD COLUMN amount_oz_left numeric NULL,
  ADD COLUMN amount_oz_right numeric NULL;