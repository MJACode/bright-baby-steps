-- Milestone flagging engine
-- Reuses existing speech.age_months_concern_flag / concern_flag_language /
-- clinical_source / clinical_source_url columns. Only flag_severity is new.

ALTER TABLE public.speech
  ADD COLUMN IF NOT EXISTS flag_severity text
    CHECK (flag_severity IN ('watch', 'concern', 'act'));

-- Per-child record of which milestone flags have fired and how the parent
-- has handled them. A row exists once a flag has fired at least once.
CREATE TABLE public.milestone_flags (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id          uuid        NOT NULL REFERENCES public.profiles(id),
  milestone_id       uuid        NOT NULL REFERENCES public.speech(id) ON DELETE CASCADE,
  severity           text        NOT NULL CHECK (severity IN ('watch', 'concern', 'act')),
  first_flagged_at   timestamptz NOT NULL DEFAULT now(),
  last_evaluated_at  timestamptz NOT NULL DEFAULT now(),
  dismissed_at       timestamptz,
  dismissed_reason   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, milestone_id)
);

ALTER TABLE public.milestone_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own milestone flags" ON public.milestone_flags
  FOR ALL USING (auth.uid() = parent_id OR public.has_partner_access(auth.uid(), parent_id));

CREATE TRIGGER update_milestone_flags_updated_at
  BEFORE UPDATE ON public.milestone_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
