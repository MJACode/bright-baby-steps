
CREATE TABLE public.custom_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL,
  parent_id UUID NOT NULL,
  name TEXT NOT NULL,
  achieved_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own custom milestones"
ON public.custom_milestones
FOR ALL
USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));
