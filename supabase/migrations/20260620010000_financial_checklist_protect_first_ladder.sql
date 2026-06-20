-- Financial-tab upgrade (2/2): "protect first, then invest" ladder.
--
-- Reorders the live financial_checklist_items via sort_order and adds the
-- missing protection-ladder items so the displayed/queried order is:
--
--   1. Add baby to health insurance (30-day window)
--   2. Build a 3–6 month emergency fund (HYSA)
--   3. Term life on the income-earning parent(s)
--   4. Disability insurance
--   5. Will + guardianship designation
--   6. Beneficiary updates after birth
--   7. THEN invest: 529 → custodial / UGMA → custodial Roth
--   8. Tax benefits (CTC, DCFSA vs. Child & Dependent Care Credit, HSA, state)
--   9. Estate (trusts / POA / healthcare directive)
--
-- CONTEXT — this migration runs AFTER the canonical reconcile/refresh migrations
-- (20260619180000 / 20260619190000), so it operates on the LIVE 16-row set with
-- its real UUIDs and live category names (College Savings, Insurance, Estate
-- Planning, Emergency Fund, Government Programs, Childcare & Benefits, Investing
-- for Kids). It does NOT reintroduce the stale 20260407000000 categories.
--
-- NUMBERS POLICY — every dollar figure / limit / threshold is either CONCEPTUAL
-- ("how it works") or carries a (2026) year stamp; numeric specifics live in
-- annual_limit_note. No bare numbers in titles/descriptions.
--
-- IDEMPOTENCY — existing rows reordered/strengthened by UPDATE ... WHERE id = …
-- (stable UUID). New rows inserted with deterministic UUIDs via ON CONFLICT (id)
-- DO UPDATE, so a re-run upserts identical content (a no-op).

-- ── 0. Remove stale "Trump-era" / Opportunity Zone investing rows ──────────────
-- These predate the protect-first ladder and quote a repealed-context framing.
-- The custodial Roth is REPLACED below by an evergreen row; the kiddie-tax and
-- Opportunity Zone rows are dropped outright (no parent_financial_checklist row
-- references them on live — verified in 20260619180000's canonical-set comment).
DELETE FROM public.financial_checklist_items
WHERE id IN (
  '0abe709b-641a-4fd9-904c-04a486436764',  -- Consider a Trump-era Roth IRA for your child
  '4345e226-5a6d-4deb-bd51-2d86edd9926f',  -- Review Trump-era tax brackets for kiddie tax
  'f1e54976-9911-4bd0-903a-89bd99ad2f77'   -- Explore Opportunity Zone investments
);

-- ── 1. Reorder existing live rows into the protect-first ladder ────────────────
-- Health insurance (30-day window) leads.
UPDATE public.financial_checklist_items
SET sort_order = 10, updated_at = now()
WHERE id = '0e5308b3-fc91-418b-89da-fe3606f0ab4d';  -- Add your child to health insurance

-- Emergency fund (3–6 months in an HYSA) — strengthen copy to name the HYSA.
UPDATE public.financial_checklist_items
SET sort_order = 20,
    description = $f$An emergency fund covers unexpected expenses (job loss, medical bills, car repair) without going into debt. Aim for 3–6 months of living expenses kept in a high-yield savings account (HYSA) so it stays liquid and earns interest while you're not using it.$f$,
    updated_at = now()
WHERE id = '9ec05ab1-361b-4e03-a900-8d4311ce3925';  -- Build a 3–6 month emergency fund

-- Term life on the income earner(s) — strengthen the EXISTING life-insurance row
-- to teach the term-on-the-earner / not-whole-life-on-the-baby distinction.
UPDATE public.financial_checklist_items
SET sort_order = 30,
    title = $f$Get term life insurance on the income-earning parent(s)$f$,
    description = $f$Buy term life insurance on the parent(s) whose income the family depends on — that is what replaces lost income if they die. Do NOT buy whole-life ("permanent") insurance on the baby: insuring a baby's life provides no income replacement (a baby earns no income), and the savings component is an expensive, low-return way to invest for a child compared with a 529 or custodial account. A level term policy covering your working years is the high-impact, low-cost choice.$f$,
    why_it_matters = $f$A surviving parent and child need the lost paycheck replaced, not a small policy on a baby. Term life on the earner is inexpensive while you're young and healthy and protects the people who depend on that income.$f$,
    updated_at = now()
WHERE id = 'a57ac9a4-282b-4f3f-bb32-2fc354fe50ed';  -- Review your life insurance coverage

-- Disability insurance.
UPDATE public.financial_checklist_items
SET sort_order = 40, updated_at = now()
WHERE id = '2e11d795-00c3-4cc3-a7d7-681883660138';  -- Consider disability insurance

-- Will + guardianship designation (two live rows that together form this step).
UPDATE public.financial_checklist_items
SET sort_order = 50, updated_at = now()
WHERE id = '67b94e82-5d71-424b-9d27-b1b4e0eea6af';  -- Create or update your will

UPDATE public.financial_checklist_items
SET sort_order = 51, updated_at = now()
WHERE id = '8058e21a-05d9-4550-8e3e-69cd4fa58325';  -- Name a guardian for your child

-- Beneficiary updates after birth.
UPDATE public.financial_checklist_items
SET sort_order = 60, updated_at = now()
WHERE id = 'c94f2acc-6961-45fc-9e7d-f6a2f5f7f4f1';  -- Establish or update beneficiary designations

-- THEN invest: 529, name 529 beneficiary, custodial brokerage.
UPDATE public.financial_checklist_items
SET sort_order = 70, updated_at = now()
WHERE id = 'fc3b5898-84c8-4451-924a-de5841181b2e';  -- Open a 529 college savings plan

UPDATE public.financial_checklist_items
SET sort_order = 71, updated_at = now()
WHERE id = '08ae0699-d90e-4251-bc02-d850e49b345f';  -- Name your child as 529 beneficiary

UPDATE public.financial_checklist_items
SET sort_order = 72, updated_at = now()
WHERE id = 'cbb52592-5285-4681-93b1-295b6cc4aec3';  -- Open a custodial brokerage account (UTMA/UGMA)

-- Tax benefits: Child Tax Credit (conceptual), state benefits, DCFSA.
UPDATE public.financial_checklist_items
SET sort_order = 80, updated_at = now()
WHERE id = '77815235-2084-454d-8a23-d98f3cdd7dfa';  -- Understand your Child Tax Credit eligibility

UPDATE public.financial_checklist_items
SET sort_order = 81, updated_at = now()
WHERE id = '29b66bc4-e732-4519-9909-aa4c02d41bb0';  -- Research your state's child-related tax benefits

UPDATE public.financial_checklist_items
SET sort_order = 82, updated_at = now()
WHERE id = '60e46382-8123-4b5b-b54c-ccba66b9cf43';  -- Set up a Dependent Care FSA if available

-- ── 2. Add the missing ladder items ────────────────────────────────────────────
-- Deterministic UUIDs so the upsert is stable across rebuilds. Keyed on id for
-- idempotency; titles are also natural keys for the persona/Next-Step feed.
INSERT INTO public.financial_checklist_items
  (id, category, title, description, recommended_timing, why_it_matters,
   disclaimer, external_resource_url, annual_limit_note, sort_order)
VALUES
  -- Custodial Roth IRA — evergreen replacement for the deleted Trump-era row.
  ('b1f0a3c2-1d4e-4a6b-9c8d-0e1f2a3b4c5d', $f$Investing for Kids$f$,
   $f$Open a custodial Roth IRA (only if your child has earned income)$f$,
   $f$If your child has genuine earned income (for example, modeling, acting, or wages from real work), a parent can open a custodial Roth IRA for them. Contributions are limited to the child's earned income for the year, up to the federal IRA annual limit. Decades of tax-free compounding make even small early contributions powerful.$f$,
   $f$When your child has earned income$f$,
   $f$Tax-free growth over a very long horizon means modest childhood contributions can compound into a meaningful retirement head start — but only earned income qualifies.$f$,
   $f$This is general educational information, not personalized financial advice. Consult a tax professional.$f$,
   $f$https://www.irs.gov/retirement-plans/roth-iras$f$,
   $f$Contribution is capped at the lesser of the child's earned income or the federal IRA annual limit; the limit is adjusted periodically, so verify the current amount at IRS.gov.$f$, 73),

  -- DCFSA vs. Child & Dependent Care Credit — teaches they interact.
  ('c2a1b4d3-2e5f-4b7c-8d9e-1f2a3b4c5d6e', $f$Childcare & Benefits$f$,
   $f$Compare a Dependent Care FSA with the Child & Dependent Care Credit$f$,
   $f$Both reduce the cost of childcare, but they interact — you generally cannot use the same childcare dollars for both. A Dependent Care FSA (DCFSA) sets aside pre-tax dollars through your employer and is elected only at open enrollment or after a qualifying life event (such as a birth). The Child & Dependent Care Credit is a federal tax credit claimed at tax time. Many families use the FSA first and may claim the credit on remaining eligible expenses. Run both options for your bracket before open enrollment.$f$,
   $f$Plan before open enrollment$f$,
   $f$Choosing the wrong combination — or missing the open-enrollment window for the FSA — can cost real money. Understanding that the two benefits offset each other helps you elect the right amount.$f$,
   $f$This is general educational information. Consult your HR department and a tax professional; the better choice depends on your income and childcare costs.$f$,
   $f$https://www.irs.gov/publications/p503$f$,
   $f$You generally can't claim the credit on expenses already paid pre-tax through a DCFSA. Contribution caps and credit percentages are IRS-set and adjusted periodically — verify at IRS.gov for your filing year.$f$, 83),

  -- HSA — triple tax advantage if on an HDHP.
  ('d3b2c5e4-3f6a-4c8d-9e0f-2a3b4c5d6e7f', $f$Childcare & Benefits$f$,
   $f$Use an HSA if you're on a high-deductible health plan$f$,
   $f$If your family is enrolled in a qualifying high-deductible health plan (HDHP), a Health Savings Account (HSA) offers a triple tax advantage: contributions go in pre-tax, the balance grows tax-free, and withdrawals for qualified medical expenses (including your child's) are tax-free. Unspent funds roll over year to year — unlike a Dependent Care FSA, an HSA is not use-it-or-lose-it.$f$,
   $f$During open enrollment$f$,
   $f$An HSA can cover your baby's deductible and out-of-pocket medical costs with pre-tax dollars, and any balance you don't spend keeps growing for future health needs.$f$,
   $f$This is general educational information, not personalized financial advice. An HSA requires an HSA-eligible HDHP — confirm eligibility with your plan.$f$,
   $f$https://www.irs.gov/publications/p969$f$,
   $f$HSA eligibility requires a qualifying HDHP. Annual contribution limits are IRS-set and adjusted yearly — verify the current individual/family limits at IRS.gov.$f$, 84),

  -- Estate: revocable living trust / POA + healthcare directive (was missing on live).
  ('e4c3d6f5-4a7b-4d9e-8f1a-3b4c5d6e7f80', $f$Estate Planning$f$,
   $f$Consider a power of attorney, healthcare directive, and trust for minors$f$,
   $f$Beyond a will, a durable power of attorney names who manages your finances if you're incapacitated, and a healthcare directive documents your medical wishes. If you want to control how and when assets reach your child (for example, distributed in stages rather than all at adulthood), a revocable living trust can hold assets for their benefit and avoid probate.$f$,
   $f$Within the first year$f$,
   $f$These documents protect your family if you're alive but unable to act, and a trust lets you set conditions on an inheritance rather than handing it over outright at the age of majority.$f$,
   $f$This is general guidance. Consult a licensed attorney to set up documents valid in your state.$f$,
   $f$https://www.americanbar.org/groups/real_property_trust_estate/resources/estate_planning/$f$,
   NULL, 90)
ON CONFLICT (id) DO UPDATE SET
  category              = EXCLUDED.category,
  title                 = EXCLUDED.title,
  description           = EXCLUDED.description,
  recommended_timing    = EXCLUDED.recommended_timing,
  why_it_matters        = EXCLUDED.why_it_matters,
  disclaimer            = EXCLUDED.disclaimer,
  external_resource_url = EXCLUDED.external_resource_url,
  annual_limit_note     = EXCLUDED.annual_limit_note,
  sort_order            = EXCLUDED.sort_order,
  updated_at            = now();
