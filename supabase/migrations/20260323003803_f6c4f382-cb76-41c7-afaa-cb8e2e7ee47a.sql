
-- Drop the daily log table, replace with an active supplement tracking table
DROP TABLE IF EXISTS public.supplement_logs;

CREATE TABLE public.supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  stopped_at date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own supplements"
  ON public.supplements
  FOR ALL
  TO public
  USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));
