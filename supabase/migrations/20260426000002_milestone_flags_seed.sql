-- SLP-authored milestone flag copy. flag_message is parent-facing — preserved verbatim.
-- Mapping from supabase/seed/milestone_flags_seed.csv was reviewed manually (16 of 27
-- CSV rows have a confident DB equivalent; the rest will land in a future migration
-- once their milestones are added to the speech catalog).

UPDATE public.speech SET
  age_months_concern_flag = 3,
  flag_severity = 'concern',
  concern_flag_language = $msg$Your baby doesn't seem to react to loud sounds yet. This is worth mentioning at your next visit — it's one of the earliest signs of hearing we look for.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Reacts to sounds (startles, calms to voice)';

UPDATE public.speech SET
  age_months_concern_flag = 5,
  flag_severity = 'concern',
  concern_flag_language = $msg$Most babies turn toward familiar voices by 4 months. If your baby isn't doing this, let your pediatrician know — a hearing check is a good first step.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Recognizes parents'' voices';

UPDATE public.speech SET
  age_months_concern_flag = 4,
  flag_severity = 'watch',
  concern_flag_language = $msg$Most babies start cooing by 2–3 months. If your baby isn't making any vowel sounds yet, it's worth noting at the next checkup.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Coos and makes gurgling sounds';

UPDATE public.speech SET
  age_months_concern_flag = 6,
  flag_severity = 'watch',
  concern_flag_language = $msg$Laughing usually emerges around 4 months. If your baby isn't laughing or vocalizing socially, let your pediatrician know.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Laughs and squeals';

UPDATE public.speech SET
  age_months_concern_flag = 9,
  flag_severity = 'concern',
  concern_flag_language = $msg$Babbling with consonant sounds should be emerging by 6–7 months. No babbling by 9 months is a red flag for both hearing and speech development — request a hearing test if not already done.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Babbles with consonants (ba, da, ma)';

UPDATE public.speech SET
  age_months_concern_flag = 3,
  flag_severity = 'concern',
  concern_flag_language = $msg$A social smile (smiling back at you) usually appears by 2 months. If your baby isn't smiling responsively by 3 months, it's worth bringing up at the next visit.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Social smile';

UPDATE public.speech SET
  age_months_concern_flag = 15,
  flag_severity = 'watch',
  concern_flag_language = $msg$Using 'mama' and 'dada' as real labels (not just sounds) usually happens by 12 months. If this isn't happening by 15 months, mention it at the next visit.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Says "mama" or "dada" with meaning';

UPDATE public.speech SET
  age_months_concern_flag = 16,
  flag_severity = 'concern',
  concern_flag_language = $msg$Most children say their first word by 12 months. If no meaningful words have appeared by 16 months, an early speech evaluation is recommended — earlier is always better.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Uses 1–3 words besides "mama"/"dada"';

UPDATE public.speech SET
  age_months_concern_flag = 14,
  flag_severity = 'watch',
  concern_flag_language = $msg$Spontaneous waving (not just when prompted every time) typically emerges by 12 months. If your child isn't waving yet, note it for the 12-month visit.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Waves bye-bye';

UPDATE public.speech SET
  age_months_concern_flag = 15,
  flag_severity = 'concern',
  concern_flag_language = $msg$Imitating actions and sounds is how babies learn — it's also a key social-communication milestone. If imitation is absent by 15 months, mention it at the next visit.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Imitates actions';

UPDATE public.speech SET
  age_months_concern_flag = 16,
  flag_severity = 'concern',
  concern_flag_language = $msg$Pointing to share interest ('look at that!') is one of the most important early social-communication skills. If this isn't happening by 14–16 months, a developmental evaluation is recommended.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Shows objects to share interest';

UPDATE public.speech SET
  age_months_concern_flag = 24,
  flag_severity = 'watch',
  concern_flag_language = $msg$Most children can point to at least 1–2 body parts by 18 months. If this isn't emerging, it's worth tracking carefully through the 2-year visit.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Points to body parts when asked';

UPDATE public.speech SET
  age_months_concern_flag = 24,
  flag_severity = 'concern',
  concern_flag_language = $msg$Combining two words by 24 months is expected. If your child isn't doing this yet, a speech evaluation is the right next step.$msg$,
  clinical_source = 'CDC',
  clinical_source_url = 'https://www.cdc.gov/ncbddd/actearly/milestones/index.html',
  clinical_last_reviewed_at = current_date
WHERE name = 'Combines two words ("more milk", "go bye-bye")';

UPDATE public.speech SET
  age_months_concern_flag = 24,
  flag_severity = 'concern',
  concern_flag_language = $msg$50 words by 24 months is a well-established milestone. If vocabulary is significantly below this, a speech-language evaluation is important.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Has a vocabulary of about 50 words';

UPDATE public.speech SET
  age_months_concern_flag = 30,
  flag_severity = 'watch',
  concern_flag_language = $msg$Simple pretend play typically starts around 18–24 months. If play is still very concrete and repetitive by 30 months, it's worth discussing with your pediatrician.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Pretend play (feeds doll, talks on toy phone)';

UPDATE public.speech SET
  age_months_concern_flag = 36,
  flag_severity = 'watch',
  concern_flag_language = $msg$Three-word phrases typically emerge between 24–36 months. If language is notably less complex than this by age 3, mention it to your pediatrician.$msg$,
  clinical_source = 'ASHA',
  clinical_source_url = 'https://www.asha.org/public/speech/development/communicative-milestones/',
  clinical_last_reviewed_at = current_date
WHERE name = 'Uses 3+ word sentences';
