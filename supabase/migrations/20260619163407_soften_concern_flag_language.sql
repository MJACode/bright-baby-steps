-- Softens diagnostic concern_flag_language per legal + SLP review (Phase 3 act-early).
-- Non-diagnostic, ASHA-aligned; routes to pediatrician conversation, not app-voice
-- clinical recommendation.
--
-- 11 idempotent UPDATEs. Each WHERE clause reuses the SAME `name` key the original
-- seed migration used to write the value being replaced:
--   - 20260426000002_milestone_flags_seed.sql        (rows 1, 2, 3, 4, 5)
--   - 20260429000001_tier1_milestone_flag_seeds.sql  (rows 6, 7, 8, 9, 10, 11)
-- Re-running is a no-op (UPDATE to the same value). New values dollar-quoted ($msg$)
-- so apostrophes need no escaping, matching the seeds' convention.

-- 1. babbling-9mo (was: "No babbling by 9 months is a red flag...request a hearing test...")
UPDATE public.speech SET
  concern_flag_language = $msg$Babbling with consonant sounds usually emerges by 6–7 months. If your baby isn't babbling by 9 months, it's worth asking your pediatrician about — and asking whether a hearing check makes sense, since hearing and early babbling go hand in hand.$msg$
WHERE name = 'Babbles with consonants (ba, da, ma)';

-- 2. first-word-16mo (was: "...no meaningful words by 16 months, an early speech evaluation is recommended — earlier is always better.")
UPDATE public.speech SET
  concern_flag_language = $msg$Most children say their first word by around 12 months. If no meaningful words have appeared by 16 months, this is a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Uses 1–3 words besides "mama"/"dada"';

-- 3. pointing-14-16mo (was: "...pointing...by 14–16 months, a developmental evaluation is recommended.")
UPDATE public.speech SET
  concern_flag_language = $msg$Pointing to share interest ('look at that!') is one of the most important early social-communication skills. If this isn't happening by 14–16 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Shows objects to share interest';

-- 4. two-words-24mo (was: "Combining two words by 24 months...a speech evaluation is the right next step.")
UPDATE public.speech SET
  concern_flag_language = $msg$Combining two words (like 'more milk') usually happens by 24 months. If your child isn't doing this yet, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Combines two words ("more milk", "go bye-bye")';

-- 5. 50-words-24mo (was: "50 words by 24 months...a speech-language evaluation is important.")
UPDATE public.speech SET
  concern_flag_language = $msg$Around 50 words by 24 months is a well-established milestone. If your child's vocabulary is well below this, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Has a vocabulary of about 50 words';

-- 6. joint-attention-12-14mo (was: "...joint attention...by 12–14 months, a developmental evaluation is recommended.")
UPDATE public.speech SET
  concern_flag_language = $msg$Following a point to see what someone is showing you (called joint attention) is a key early communication skill. If this isn't happening by 12–14 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Looks where you point (joint attention)';

-- 7. follow-directions-18mo (was: "Following simple directions...by 18 months...an early speech-language evaluation can help identify any support needed.")
UPDATE public.speech SET
  concern_flag_language = $msg$Following simple directions without gestures by 18 months is a key language (understanding) milestone. If this isn't happening, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Follows one-step directions without gesture';

-- 8. 10-words-18mo (was: "...fewer than 10 words...a speech-language evaluation is recommended. Research shows early support leads to significantly better outcomes.")
UPDATE public.speech SET
  concern_flag_language = $msg$Around 10 or more words by 18 months is a key milestone. If your child has fewer words than this, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help. Support is most accessible early — Early Intervention is free for children under 3 in the US.$msg$
WHERE name = 'Uses 10+ different words';

-- 9. 2yr-intelligibility (was: "Parents...should understand most of what a 2-year-old says...a speech evaluation is helpful.")
UPDATE public.speech SET
  concern_flag_language = $msg$Familiar people usually understand most of what a 2-year-old says. If your child's speech (the clarity of their sounds) is often unclear even to you, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Speech mostly understood by family';

-- 10. two-step-24mo (was: "Understanding two-step directions by 24 months...a speech-language evaluation is recommended.")
UPDATE public.speech SET
  concern_flag_language = $msg$Understanding two-step directions usually emerges by around 24 months. If this is still difficult, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Follows two-step directions';

-- 11. 3yr-intelligibility (was: "By age 3, most...understandable to unfamiliar listeners...a speech-language evaluation is recommended.")
UPDATE public.speech SET
  concern_flag_language = $msg$By age 3, most of what a child says is usually understandable to people outside the family. If your child's speech (how clearly sounds come out) is often hard for others to understand, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$
WHERE name = 'Speech mostly understood by strangers';
