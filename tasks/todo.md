# Task — Word Journal: drop the "sound" framing, pull it into the pediatrician report

Two asks in one: (1) the Word & Sound Journal becomes just the **Word Journal**,
and (2) what a parent logs there has to show up in the pediatrician PDF. It
didn't before — the report's "speech" section was the milestone catalog
(`child_speech`), and `speech_journal` was never read by the exporter at all.

## Decisions
- **No migration.** `public.speech_journal` and its `word_or_sound` column keep
  their names. The rename is a product/naming change; the column is internal
  and never user-visible, and renaming it would mean a live migration plus
  redeploys of `weekly-insights` and `generate-speech-class` for zero
  user-facing benefit. Comments at each call site record the reason so the
  mismatch doesn't read as an oversight later.
- **Existing rows are untouched.** A parent who logged "babababa" under the old
  framing keeps that entry — readable, editable, exportable, still covered by
  `delete_user_account()`.
- **Its own report section, not folded into Milestones.** "Milestones" is the
  CDC/AAP catalog with achieved dates; the journal is a free-text vocabulary
  inventory. Different shape, different clinical read — and its own checkbox
  means a parent can leave it out of a visit that isn't about language.
- **Benchmark extracted, not duplicated.** `VOCAB_BENCHMARKS` lived inside
  `SpeechInsightsPanel`. The PDF needs the same table, so it moved to
  `src/lib/vocabBenchmarks.ts` and both read from it — the parent and the
  pediatrician quote the same numbers.
- **All-time count alongside the in-period count.** A 1-month window shows a
  handful of new words; the running total is what a pediatrician screens
  against. Both are printed.
- **`parseISO`, not `new Date`.** `entry_date` is a date-only column;
  `new Date("2026-08-29")` is UTC midnight and renders a day early west of
  Greenwich. The in-app journal card had this bug too — fixed alongside.

## Rename — "Word & Sound Journal" → "Word Journal"
- [x] `WordSoundJournal.tsx` → `WordJournal.tsx` (component, props, local state)
- [x] Input placeholder: "Word or sound (e.g. 'mama', 'babababa')" → "Word (e.g.
      'mama', 'more', 'doggy')"
- [x] Empty state: "Every little sound is a big moment!" → "Every new word is a
      big moment!"
- [x] `MilestonesPage.tsx` import + usage
- [x] `OnboardingWizard.tsx` — interest preview, CTA label, feature list
- [x] `UpgradeSheet.tsx` speech-class upsell, `SignsPage.tsx` first-sign toast
- [x] `SpeechInsightsPanel.tsx` AI prompt — "words/sounds" → "words"
- [x] `chat` and `generate-speech-class` edge-function comments + prompt line
- [x] Left alone deliberately: cry analyzer, milestone catalog copy, activity
      library, sleep triage, leaps, sign library — unrelated uses of "sound".
      Applied migrations are historical records and were not rewritten.

## Pediatrician report
- [x] `src/lib/vocabBenchmarks.ts` (new) — `VOCAB_BENCHMARKS` +
      `getVocabBenchmark(ageMonths)`, extracted from `SpeechInsightsPanel`
- [x] `reportDataService.ts` — new `words` section key; two queries behind it
      (in-range entries by `entry_date`, all-time `count: "exact", head: true`)
- [x] `pdfReportBuilder.ts` — `WordJournalEntry` type, `renderWordJournal`
      between Milestones and Feeding: all-time total, new-words-in-period,
      age benchmark, non-diagnostic qualifier, then each word with its date and
      the parent's context note
- [x] `PediatricianExport.tsx` — "Word Journal" checkbox, on by default
- [x] Section omitted entirely when the child has never logged a word; header +
      "No new words logged in this period." when the window alone is empty

## Legal
- [x] Privacy § 4 and `/subprocessors` re-worded (3 substitutions each,
      "words or sounds" → "words"); payload bound (30 entries) unchanged
- [x] "Last reviewed" bumped to Aug 29, 2026 on both pages
- [x] `docs/legal-review-log.md` entry — LOW risk, no new subprocessor, no new
      egress; the PDF is client-side jsPDF over data the parent already owns

## Verification
- [x] `npx tsc --noEmit` — clean
- [x] `npm test` — 403/403 pass, incl. 3 new `pdfReportBuilder` cases (populated
      period, empty period with history, never-logged)
- [x] `npm run lint` — 126 problems, identical to the pre-change baseline
- [x] `npm run build` — succeeds
- [x] QA agent pass — returned **Fix-required**; findings below

## QA round 2 — findings addressed
- [x] **Blocking: `speech_journal` RLS.** Confirmed against the live DB — it was
      the one child-scoped table omitted from all 17 in
      `20260820000000_child_pivot_log_rls.sql`, still on the 2026-03 `FOR ALL`
      policy pivoted on `parent_id`. Owner couldn't see a co-parent's words, so
      the report would print an undercounted vocabulary figure beside a
      screening benchmark; and a read-only viewer could write.
      `20260829000000_speech_journal_child_pivot_rls.sql` moves it onto
      `can_access_child` / `can_write_child` with the same four-policy shape and
      a leftover-FOR-ALL assertion. **Not yet applied to live** — see below.
- [x] Count is now DISTINCT words, case-insensitive, not row count
- [x] All-time count is `null` on query error, and the line is omitted rather
      than printing a contradictory "0 all time / 5 this period"
- [x] Benchmark age labelled "(corrected age)" for a premature child
- [x] Benchmark age clamps to "36+ months" past the end of the table
- [x] "Age benchmark at 18 months: 10–20 words typical" — no longer doubled
- [x] Word list capped at 50 with "Showing the 50 most recent of N entries.",
      fetched DESC so the cap keeps the newest, rendered ASC so it reads
      chronologically
- [x] Legal-log "opt-in per export" corrected to opt-out, with a correction note
      (the log is the paper trail; a silent edit would defeat it)
- [x] 9 new tests total (20 in `pdfReportBuilder`, 5 in `vocabBenchmarks`)

## Deploy step still required
`supabase/migrations/20260829000000_speech_journal_child_pivot_rls.sql` is
written and committed but **not applied to live**. Until it is, a co-parent's
logged words stay invisible to the child's owner in the app and in the report.
Left for a human call — changing production RLS wasn't part of the ask.

## Review
The report gap was the real work here — the rename is copy. Worth noting for
whoever picks this up next: `speech_journal` rows are read by three surfaces now
(the journal card, Speech Class, weekly insights) plus the report, and all four
go through `word_or_sound`. If that column is ever renamed, those are the four.
