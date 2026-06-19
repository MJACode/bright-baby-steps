-- Refresh dated dollar/year figures in public.financial_checklist_items to
-- evergreen phrasing, matching the Child Tax Credit row's "verify at IRS.gov"
-- style. The reconciliation migration (20260619180000) reproduces production
-- verbatim, including the figures below; this is the deliberate content edit it
-- pointed to. Runs after reconciliation on a fresh build, so the end state is
-- the evergreen copy. Idempotent: re-running sets identical values.
--
-- Two rows carried hard figures that go stale:
--   529 plan      → annual_limit_note ($19,000/$38,000, 2025/2026)
--   Dependent Care FSA → description + why_it_matters ($5,000, 2024, $1,000–$1,500)
-- Historical references to "the Tax Cuts and Jobs Act of 2017" (kiddie-tax and
-- Opportunity Zone rows) are left as-is: that is the law's enactment year, not a
-- figure that expires.

UPDATE public.financial_checklist_items
SET annual_limit_note = $f$Contributions within the annual federal gift-tax exclusion avoid gift-tax reporting; the limit is adjusted periodically, so verify the current amount at IRS.gov.$f$,
    updated_at = now()
WHERE id = 'fc3b5898-84c8-4451-924a-de5841181b2e';

UPDATE public.financial_checklist_items
SET description = $f$A Dependent Care Flexible Spending Account (FSA) lets you pay for eligible childcare expenses with pre-tax dollars through your employer (if offered). The IRS sets an annual household contribution cap, so check your plan or HR for the current limit.$f$,
    why_it_matters = $f$Pre-tax childcare savings reduce your taxable income, so you keep more of what you'd otherwise pay in taxes. How much you save depends on your contribution and tax bracket — your HR or a tax pro can estimate it for you.$f$,
    updated_at = now()
WHERE id = '60e46382-8123-4b5b-b54c-ccba66b9cf43';
