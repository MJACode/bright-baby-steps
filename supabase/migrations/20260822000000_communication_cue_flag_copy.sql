-- SLP-authored flag copy for the communication-cue milestones added in
-- 20260821000000_communication_cue_milestones.sql. 6 of the 15 new rows are
-- flagged; the other 9 intentionally stay NULL (a single consolidated
-- gestures-by-12 flag lives on the lifts-arms row instead of three duplicate
-- banners; culturally-variable or already-covered signals are left unflagged).
--
-- Also reconciles two pre-existing rows so each screening signal fires on
-- exactly one row: declarative pointing moves to the new 'Points to show you
-- something interesting' row, 'Shows objects to share interest' retargets to
-- object-showing, and 'Imitates actions' narrows to actions/gestures with
-- sound-imitation now covered by 'Copies sounds you make'.
--
-- Voice matches the softened non-diagnostic conventions of
-- 20260619163407_soften_concern_flag_language.sql. UPDATEs are naturally
-- idempotent — re-running rewrites the same values. New copy dollar-quoted
-- ($msg$) so apostrophes need no escaping, matching the seeds' convention.

-- 1. attention-seeking-6mo
UPDATE public.speech SET
  age_months_concern_flag = 6,
  flag_severity = 'watch',
  concern_flag_language = $msg$Babies usually look at you, wiggle, or make sounds to get and keep your attention by around 4 months. If your baby rarely tries to engage you by 6 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Makes sounds or moves to get your attention';

-- 2. sound-imitation-12mo
UPDATE public.speech SET
  age_months_concern_flag = 12,
  flag_severity = 'watch',
  concern_flag_language = $msg$Copying speech sounds back and forth usually starts by 9–12 months. If your baby isn't imitating any sounds by 12 months, it's worth bringing up with your pediatrician — and worth asking whether a hearing check makes sense, since copying sounds depends on hearing them.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Copies sounds you make';

-- 3. jargon-15mo
UPDATE public.speech SET
  age_months_concern_flag = 15,
  flag_severity = 'watch',
  concern_flag_language = $msg$Long strings of babble with the rise and fall of real speech usually appear by 12–14 months. If your baby's sounds are still few or very quiet by 15 months, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Babbles with sentence-like rhythm (jargon)';

-- 4. word-comprehension-16mo
UPDATE public.speech SET
  age_months_concern_flag = 16,
  flag_severity = 'watch',
  concern_flag_language = $msg$Understanding words comes in before saying them — most children look at a familiar object when you name it by 12–15 months. If this isn't happening by 16 months, it's a good thing to bring up with your pediatrician — and worth asking whether a hearing check makes sense, since understanding words depends on hearing them.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Looks at a familiar object when you name it';

-- 5. gestures-by-12mo (consolidated: covers reaching up, waving, showing, giving)
UPDATE public.speech SET
  age_months_concern_flag = 12,
  flag_severity = 'concern',
  concern_flag_language = $msg$Early gestures — reaching up to be held, waving, showing, and giving — usually appear between 9 and 12 months. If your baby isn't using any gestures by 12 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Lifts arms up to be picked up';

-- 6. declarative-pointing-16mo
UPDATE public.speech SET
  age_months_concern_flag = 16,
  flag_severity = 'concern',
  concern_flag_language = $msg$Pointing to share interest ('look at that!') is one of the most important early social-communication skills. If this isn't happening by 14–16 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help. Support is most accessible early — Early Intervention is free for children under 3 in the US.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Points to show you something interesting';

-- 7. Pre-existing row reconciliation: this row previously carried the
-- declarative-pointing flag copy (20260619163407 row 3). That signal now
-- lives on the new 'Points to show you something interesting' row (above),
-- so this row retargets to what its name actually describes — showing/giving
-- objects to share interest.
UPDATE public.speech SET
  age_months_concern_flag = 15,
  flag_severity = 'watch',
  concern_flag_language = $msg$Holding up or bringing you things just to share them ('look what I found!') usually appears by 10–14 months. If your child isn't showing or giving you objects to share by 15 months, it's worth bringing up with your pediatrician, who can tell you whether an evaluation would help.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Shows objects to share interest';

-- 8. Pre-existing row reconciliation: previously flagged "imitating actions
-- and sounds" (20260426000002). Sound imitation is now covered by 'Copies
-- sounds you make' (above), so this copy narrows to actions/gestures only.
-- age_months_concern_flag (15) and flag_severity ('concern') are intentionally
-- left untouched.
UPDATE public.speech SET
  concern_flag_language = $msg$Copying actions and gestures — waving back, clapping when you clap, stirring with a spoon — usually emerges by 9–12 months. If your child isn't imitating any actions by 15 months, it's a good thing to bring up with your pediatrician, who can tell you whether an evaluation would help.$msg$,
  clinical_last_reviewed_at = current_date
WHERE name = 'Imitates actions';
