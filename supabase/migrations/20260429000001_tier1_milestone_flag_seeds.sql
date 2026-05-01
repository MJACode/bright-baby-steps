-- SLP-authored flag copy for the Tier 1 milestones added in 20260429000000.
-- Verbatim from supabase/seed/milestone_flags_seed.csv (rows 19, 20, 4, 21, 5,
-- 6, 14, 27, 8, 28). flag_message text is parent-facing — preserved verbatim.

UPDATE public.speech SET
  age_months_concern_flag = 4,
  flag_severity = 'concern',
  concern_flag_language = $msg$Good eye contact is foundational for communication development. If your baby rarely makes eye contact by 3–4 months, mention it at the next checkup.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Makes eye contact';

UPDATE public.speech SET
  age_months_concern_flag = 7,
  flag_severity = 'watch',
  concern_flag_language = $msg$Back-and-forth sound exchanges (the early version of conversation) should be emerging by 4–6 months. If your baby doesn't engage in vocal back-and-forth, note it for the 6-month visit.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Takes turns vocalizing (back-and-forth)';

UPDATE public.speech SET
  age_months_concern_flag = 12,
  flag_severity = 'concern',
  concern_flag_language = $msg$Responding to name by 9 months is an important social-communication milestone. If this isn't happening consistently yet, mention it at the 12-month visit.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Looks when you call her name';

UPDATE public.speech SET
  age_months_concern_flag = 14,
  flag_severity = 'concern',
  concern_flag_language = $msg$Following a point to see what someone is showing you (called joint attention) is a critical early communication skill. If this isn't happening by 12–14 months, a developmental evaluation is recommended.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Looks where you point (joint attention)';

UPDATE public.speech SET
  age_months_concern_flag = 15,
  flag_severity = 'watch',
  concern_flag_language = $msg$Understanding simple words like 'no' usually happens around 9–12 months. Keep tracking — if it's not emerging by 15 months, bring it up with your pediatrician.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Understands the word ''no''';

UPDATE public.speech SET
  age_months_concern_flag = 18,
  flag_severity = 'concern',
  concern_flag_language = $msg$Following simple directions (without pointing) by 18 months is a key language milestone. If this isn't happening, an early speech-language evaluation can help identify any support needed.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Follows one-step directions without gesture';

UPDATE public.speech SET
  age_months_concern_flag = 18,
  flag_severity = 'concern',
  concern_flag_language = $msg$A vocabulary of at least 10 words by 18 months is a key milestone. If your child has fewer than 10 words, a speech-language evaluation is recommended. Research shows early support leads to significantly better outcomes.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Uses 10+ different words';

UPDATE public.speech SET
  age_months_concern_flag = 24,
  flag_severity = 'watch',
  concern_flag_language = $msg$Parents and familiar people should understand most of what a 2-year-old says. If speech is frequently unclear even to you, a speech evaluation is helpful.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Speech mostly understood by family';

UPDATE public.speech SET
  age_months_concern_flag = 30,
  flag_severity = 'concern',
  concern_flag_language = $msg$Understanding two-step directions by 24 months is expected. If this is difficult, a speech-language evaluation is recommended.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Follows two-step directions';

UPDATE public.speech SET
  age_months_concern_flag = 36,
  flag_severity = 'concern',
  concern_flag_language = $msg$By age 3, most of what a child says should be understandable to unfamiliar listeners. If speech is hard for others to understand, a speech-language evaluation is recommended.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Speech mostly understood by strangers';
