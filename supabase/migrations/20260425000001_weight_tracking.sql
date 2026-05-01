ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS birth_weight_oz numeric,
  ADD COLUMN IF NOT EXISTS discharge_weight_oz numeric;

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  weight_oz numeric NOT NULL,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  is_pediatrician_visit boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own weight logs"
  ON public.weight_logs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id AND c.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id AND c.parent_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_weight_logs_child_date
  ON public.weight_logs(child_id, logged_at DESC);
