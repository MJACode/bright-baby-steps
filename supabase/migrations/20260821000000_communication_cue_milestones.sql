-- Communication-cue milestone additions: closes the verbal/non-verbal
-- communication-cue gaps identified in an SLP review (ASHA communicative
-- milestones + CDC Learn the Signs. Act Early. 2022). The gesture rows give
-- the "no gestures by 12 months" guidance concrete referents (arms up, head
-- shake, pat-a-cake, declarative pointing, blowing kisses / nodding).
--
-- Flag fields (age_months_concern_flag, flag_severity, concern_flag_language)
-- are intentionally left NULL for a separate SLP-authored flag-copy migration
-- (same pattern as the tier1 additions in 20260429000000).
--
-- Idempotency: each row is guarded with WHERE NOT EXISTS on its name, because
-- this migration is applied to the live project via MCP and later
-- `supabase db push` runs must not double-insert.

-- ── Speech & Language ────────────────────────────────────────────────────────

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Uses different cries for different needs',
  'Your baby''s cries may start to sound different for hunger, tiredness, and discomfort — you''re learning their earliest language.',
  0, 3, 110,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Uses different cries for different needs');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Makes sounds or moves to get your attention',
  'Your baby may look at you, wiggle, or make sounds just to get and keep your attention.',
  2, 6, 111,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Makes sounds or moves to get your attention');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Copies sounds you make',
  'Your baby may echo speech sounds back to you — copy their sounds and they may copy yours.',
  6, 12, 112,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Copies sounds you make');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Babbles with sentence-like rhythm (jargon)',
  'Your baby may string babble together with the rise and fall of real conversation, like they''re telling you a story.',
  9, 14, 113,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Babbles with sentence-like rhythm (jargon)');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Looks at a familiar object when you name it',
  'Say "ball" or "cup" and your baby may look right at it — words are starting to mean things.',
  10, 15, 114,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Looks at a familiar object when you name it');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Points to pictures you name in a book',
  'Ask "where''s the dog?" and your toddler may point right to it.',
  13, 18, 115,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Points to pictures you name in a book');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Combines a gesture and a word together',
  'Your toddler may point at the cat while saying "cat," or reach up while saying "up."',
  13, 18, 116,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Combines a gesture and a word together');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Asks simple questions like "What''s that?"',
  'Your toddler may start asking short questions — "What''s that?" "Where kitty?" — to keep the conversation going.',
  18, 24, 117,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Asks simple questions like "What''s that?"');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Speech & Language'),
  'Names familiar objects and pictures',
  'Point to a picture and ask "what''s this?" — your toddler may name it.',
  24, 30, 118,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Names familiar objects and pictures');

-- ── Social & Emotional ───────────────────────────────────────────────────────

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Lifts arms up to be picked up',
  'Your baby may reach both arms up when they want you — one of their first clear requests without a single word.',
  6, 9, 110,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Lifts arms up to be picked up');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Shows many facial expressions',
  'Your baby''s face may now show happy, sad, angry, and surprised — watch their face and narrate what you see.',
  6, 9, 111,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Shows many facial expressions');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Shakes head "no"',
  'Your baby may turn or shake their head to tell you "no" or "all done" — protest is communication too.',
  9, 14, 112,
  'ASHA',
  'https://www.asha.org/public/speech/development/communicative-milestones/'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Shakes head "no"');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Plays gesture games like pat-a-cake',
  'Your baby may clap along and join in hand games like pat-a-cake and so-big.',
  9, 12, 113,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Plays gesture games like pat-a-cake');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Points to show you something interesting',
  'Your toddler may point at a plane or a dog just to share it with you — look, comment, and share the moment.',
  12, 18, 114,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Points to show you something interesting');

INSERT INTO public.speech (
  category_id, name, description,
  age_months_typical_start, age_months_typical_end,
  sort_order, clinical_source, clinical_source_url
)
SELECT
  (SELECT id FROM public.speech_categories WHERE name = 'Social & Emotional'),
  'Blows kisses or nods "yes"',
  'Your toddler''s gesture toolbox may grow beyond waving and pointing — blowing kisses, nodding yes, shrugging.',
  14, 24, 115,
  'CDC',
  'https://www.cdc.gov/ncbddd/actearly/milestones/index.html'
WHERE NOT EXISTS (SELECT 1 FROM public.speech WHERE name = 'Blows kisses or nods "yes"');
