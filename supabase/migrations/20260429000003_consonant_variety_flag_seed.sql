-- SLP-authored flag copy for "Uses a variety of consonants in babble" added
-- in 20260429000002. Verbatim from supabase/seed/milestone_flags_seed.csv row 26.

UPDATE public.speech SET
  age_months_concern_flag = 10,
  flag_severity = 'watch',
  concern_flag_language = $msg$A variety of consonant sounds in babble should be emerging by 6–8 months. Limited consonant variety by 10 months is worth noting.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Uses a variety of consonants in babble';
