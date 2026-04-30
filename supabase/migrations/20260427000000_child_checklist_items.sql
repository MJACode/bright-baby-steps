-- Per-child checklist tracking for the Records → New Baby Checklist tab
-- (and any future per-child checklist sections). Stores user-driven status,
-- not deadlines — deadlines are computed from child DOB at render time.

CREATE TABLE public.child_checklist_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id         uuid        NOT NULL REFERENCES public.profiles(id),
  item_key          text        NOT NULL,
  section           text        NOT NULL,
  status            text        NOT NULL DEFAULT 'not_started'
                                CHECK (status IN ('not_started', 'in_progress', 'complete', 'snoozed', 'not_applicable')),
  completed_at      timestamptz,
  snoozed_until     timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, item_key)
);

ALTER TABLE public.child_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own child checklist items" ON public.child_checklist_items
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

CREATE TRIGGER update_child_checklist_items_updated_at
  BEFORE UPDATE ON public.child_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
