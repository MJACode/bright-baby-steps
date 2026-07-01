# Misc Topics for pediatrician visits

Parents can jot down miscellaneous topics/observations about their child
(beyond structured sleep/feed/diaper/milestone logs) so they surface as
extra insight at pediatrician visits, alongside the tracked data.

Design: extend `pediatrician_reminders` (reuse-first — new table would also
require touching the COPPA purge/delete functions) with:
- `entry_type text not null default 'question' check in ('question','topic')`
- `category text` nullable check in ('behavior','feeding','sleep','health','development','other')

UI: new "Misc Topics" section in the VisitPrepCard sheet (Dashboard → Visit Prep),
with optional category tag. Topics flow into both PDF exports.

## Plan

- [x] Explore existing surfaces (VisitPrepCard, pediatrician_reminders, preVisitPdf, reportDataService)
- [x] Backend: migration + types.ts update (backend agent)
- [~] Frontend: VisitPrepCard section + preVisitPdf "Topics & Observations" + 30-day report wiring (frontend agent)
- [ ] QA pass (qa agent)
- [x] Apply additive migration to live via Supabase MCP (applied + verified on ieuznbvvwdvhtirzwkly)
- [ ] Commit, push, draft PR

## Review

(to fill in when done)
