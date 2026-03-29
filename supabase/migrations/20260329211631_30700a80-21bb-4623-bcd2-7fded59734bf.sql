
CREATE TABLE public.speech_journal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  word_or_sound text NOT NULL,
  context text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.speech_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own journal entries"
ON public.speech_journal
FOR ALL
TO public
USING ((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id));
