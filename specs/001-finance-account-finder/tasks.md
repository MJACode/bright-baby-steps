# Tasks: Finance Account Finder

## Phase 1 — Backend (agent: backend)
- [ ] T001 Migration `supabase/migrations/20260930000000_finance_account_finder.sql`: `can_manage_child_finance()`, `child_finance_finder`, `child_account_status`, `finance_account_sponsors`, RLS per data-model.md
- [ ] T002 Apply migration to live; confirm via `list_migrations`; run `get_advisors` (security)
- [ ] T003 Regenerate `src/integrations/supabase/types.ts`
- [ ] T004 `check-notifications`: add `finance_trump_claim`, `finance_529_newborn`, `finance_529_birthday` + `finance` category; deploy; confirm ACTIVE
- [ ] T005 QA pass on backend

## Phase 2 — Frontend (agent: frontend) — US1–US4
- [ ] T010 Mobbin references for the finder flow and account cards (ios)
- [ ] T011 [P] `src/lib/accountOptions.ts` (6 types, 2026 figures, sources, what-you-need, time-to-open, family line) — replaces `savingsOptions.ts`
- [ ] T012 [P] `src/lib/accountFinder.ts` + `__tests__/accountFinder.test.ts` (eligibility boundaries, all goal combos, max 2, sponsor independence)
- [ ] T013 `src/hooks/useFinanceAccounts.ts` (query root `["finance", childId]`; mutations check error + 0 rows)
- [ ] T014 `AccountFinder.tsx`, `AccountCard.tsx`; rewrite `FinancialTab.tsx` to finder + list + collapsed "Other accounts"
- [ ] T015 Delete old finance components/libs/tests; fix imports
- [ ] T016 Entry points: homeSections hint, MorePage copy + role hide, RecordsPage role message, OnboardingWizard financial copy
- [ ] T017 Notification prefs: `finance` category in `useNotificationPrefs` + ProfilePage `MUTABLE_CATEGORIES`
- [ ] T018 Remove dead `financial` persona reference only if unused (leave `chat` classifier untouched unless trivially dead)

## Phase 3 — Legal & review
- [ ] T020 legal agent review of copy, reminders, sponsor placement
- [ ] T021 `docs/legal-review-log.md` entry; Privacy/Terms edits if needed
- [ ] T022 QA pass on full diff; `npx tsc --noEmit`, `npm test`, `npm run lint`
