-- Adds "Uses a variety of consonants in babble" — distinct from the existing
-- "Babbles with consonants (ba, da, ma)" row. The existing row catches
-- "no babbling at all"; this row catches "limited consonant variety," which
-- the SLP CSV (row 26) flags as a separate (lower-severity) trigger.

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
) VALUES (
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Uses a variety of consonants in babble',
  'Uses a range of consonant sounds (b, m, p, d, g, k)',
  6, 10, 101,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
);
