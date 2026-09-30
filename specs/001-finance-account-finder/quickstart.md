# Quickstart: validating Finance Account Finder

## Local gates
```sh
npx tsc --noEmit
npm test            # includes src/lib/__tests__/accountFinder.test.ts
npm run lint        # no new problems vs baseline
```

## Scenarios
1. **Eligible baby** — child DOB 2026-03-01 → Finance → "Education", "Yes" → Trump Account + 529, each with why / what you'll need / time to open / family line.
2. **Older child** — DOB 2024-06-01 → "Anything" → custodial only; Trump Account listed without $1,000.
3. **Expected child** — is_expected, due 2026-12-01 → Trump eligible; copy says "once your baby is born".
4. **Opened status** — tap "I opened this" on 529 → reload → still opened; second child unaffected; Undo works.
5. **Role** — log in as caregiver partner → Finance not shown in More / home tile; direct `/dashboard/financial` shows role message; direct SQL select on `child_account_status` returns 0 rows.
6. **Sponsor independence** — unit test: `recommend()` output identical with sponsors present/absent (signature takes no sponsor input).
7. **Sponsor render** — insert active sponsor for `529` → button shows with adjacent "Ad"; href equals `cta_url` exactly.
8. **Reminders** — invoke check-notifications for a child aged 22 days (2026 DOB, no status) → one `finance_trump_claim`; invoke again → none; mute `finance` → none.
