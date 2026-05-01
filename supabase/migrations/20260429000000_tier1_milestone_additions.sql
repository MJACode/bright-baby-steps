-- Tier 1 milestone additions: M-CHAT-screen items and key SLP-flagged language
-- milestones missing from the catalog. These are the rows the original
-- supabase/seed/milestone_flags_seed.csv asked us to seed but which had no DB
-- equivalent at the time.
--
-- Flag fields (age_months_concern_flag, flag_severity, concern_flag_language)
-- are populated by the next migration so the SLP-authored parent-facing copy
-- lives in its own reviewable change.

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
) VALUES
  ((SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
   'Makes eye contact',
   'Makes and holds eye contact during face-to-face interactions',
   0, 3, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Takes turns vocalizing (back-and-forth)',
   'Takes turns making sounds with you — you talk, baby responds with sounds',
   3, 6, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
   'Looks when you call her name',
   'Turns or looks when their name is called',
   6, 9, 100,
   'CDC',
   'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
   'Looks where you point (joint attention)',
   'Follows your point with their gaze to see what you''re showing them',
   9, 12, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Understands the word ''no''',
   'Pauses or looks up when told ''no''',
   9, 12, 100,
   'CDC',
   'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Follows one-step directions without gesture',
   'Follows simple instructions like ''give me the ball'' without you pointing',
   12, 18, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Uses 10+ different words',
   'Has a vocabulary of at least 10 words used meaningfully',
   16, 20, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Speech mostly understood by family',
   'Primary caregivers understand most of what the child says',
   18, 24, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Follows two-step directions',
   'Follows two-step directions like ''pick up the cup and give it to me''',
   24, 30, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/'),

  ((SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
   'Speech mostly understood by strangers',
   'People outside the family understand most of what the child says',
   30, 36, 100,
   'ASHA',
   'https://www.asha.org/public/speech/development/communicative-milestones/');
