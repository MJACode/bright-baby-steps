-- Drop old consistency check constraint
ALTER TABLE public.diaper_logs DROP CONSTRAINT diaper_logs_consistency_check;

-- Migrate old data FIRST before adding new constraint
UPDATE public.diaper_logs SET consistency = 'soft' WHERE consistency = 'normal';
UPDATE public.diaper_logs SET consistency = 'soft' WHERE consistency = 'mucousy';
UPDATE public.diaper_logs SET consistency = 'hard/pellets' WHERE consistency = 'hard';

-- Add new consistency check constraint
ALTER TABLE public.diaper_logs ADD CONSTRAINT diaper_logs_consistency_check 
  CHECK (consistency = ANY (ARRAY['watery'::text, 'loose'::text, 'soft'::text, 'formed'::text, 'hard/pellets'::text]));

-- Update color constraint to include dark-brown
ALTER TABLE public.diaper_logs DROP CONSTRAINT diaper_logs_color_check;
ALTER TABLE public.diaper_logs ADD CONSTRAINT diaper_logs_color_check 
  CHECK (color = ANY (ARRAY['yellow'::text, 'green'::text, 'brown'::text, 'dark-brown'::text, 'black'::text, 'red'::text, 'white'::text, 'orange'::text, 'other'::text]));