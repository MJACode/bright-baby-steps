
-- Create pediatrician_reminders table
CREATE TABLE public.pediatrician_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL,
  text TEXT NOT NULL,
  include_in_report BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pediatrician_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own reminders"
  ON public.pediatrician_reminders
  FOR ALL
  USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));

CREATE TRIGGER update_pediatrician_reminders_updated_at
  BEFORE UPDATE ON public.pediatrician_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add next_appointment to children
ALTER TABLE public.children
  ADD COLUMN next_appointment DATE;
