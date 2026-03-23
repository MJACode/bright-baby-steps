
-- Add frequency and form columns to supplements
ALTER TABLE public.supplements ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE public.supplements ADD COLUMN IF NOT EXISTS form text;

-- Create illness_logs table
CREATE TABLE public.illness_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  illness_name text NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.illness_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own illness logs" ON public.illness_logs
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Create medication_logs table
CREATE TABLE public.medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id),
  illness_log_id uuid REFERENCES public.illness_logs(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  dose text,
  frequency text,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own medication logs" ON public.medication_logs
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

-- Add update triggers
CREATE TRIGGER update_illness_logs_updated_at
  BEFORE UPDATE ON public.illness_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_medication_logs_updated_at
  BEFORE UPDATE ON public.medication_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
