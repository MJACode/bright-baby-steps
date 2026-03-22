
-- Step 1: Update all column defaults to use gen_random_uuid() instead of uuid_generate_v4()
ALTER TABLE public.children ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.allergens ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.speech_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.speech ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.financial_checklist_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.sleep_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.diaper_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.feeding_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.allergen_introductions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.allergen_exposure_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.allergen_reactions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.child_speech ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.parent_financial_checklist ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pediatrician_exports ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 2: Now safely move uuid-ossp to extensions schema
DROP EXTENSION IF EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- Step 3: Fix search_path on update_updated_at() function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
