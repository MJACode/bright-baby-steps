
ALTER TABLE public.feeding_logs ADD COLUMN food_category text;
ALTER TABLE public.feeding_logs ADD COLUMN reaction_noted boolean DEFAULT false;
ALTER TABLE public.feeding_logs ADD COLUMN reaction_description text;
