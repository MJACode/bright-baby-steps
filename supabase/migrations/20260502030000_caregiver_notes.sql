-- Notes-for-parent inbox written by caregiver-role partners.
-- Visible to the whole family; viewers can read but not write.

CREATE TABLE IF NOT EXISTS public.caregiver_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.caregiver_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_family" ON public.caregiver_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id
        AND (c.parent_id = auth.uid() OR public.has_partner_access(auth.uid(), c.parent_id))
    )
  );

CREATE POLICY "insert_writer" ON public.caregiver_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id
        AND (c.parent_id = auth.uid() OR public.partner_can_write(c.parent_id))
    )
  );

CREATE POLICY "update_own" ON public.caregiver_notes
  FOR UPDATE USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

ALTER TABLE public.caregiver_notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'caregiver_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caregiver_notes;
  END IF;
END$$;
