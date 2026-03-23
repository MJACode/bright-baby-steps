
CREATE TABLE public.supplement_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  vitamin_d boolean NOT NULL DEFAULT false,
  iron boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own supplement logs"
  ON public.supplement_logs
  FOR ALL
  TO public
  USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));
