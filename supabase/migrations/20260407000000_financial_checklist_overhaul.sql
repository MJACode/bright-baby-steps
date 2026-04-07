-- Financial checklist overhaul:
-- 1. Add sponsor infrastructure columns
-- 2. Remove outdated/political items
-- 3. Insert comprehensive categorised checklist items

-- ── Sponsor infrastructure columns ────────────────────────────────────────────
ALTER TABLE public.financial_checklist_items
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS sponsor_cta_label text,
  ADD COLUMN IF NOT EXISTS sponsor_cta_url text,
  ADD COLUMN IF NOT EXISTS sponsor_logo_url text;

-- ── Remove outdated/political items ───────────────────────────────────────────
DELETE FROM public.financial_checklist_items
WHERE title IN (
  'Consider a Trump-era Roth IRA for your child',
  'Review Trump-era tax brackets for kiddie tax',
  'Explore Opportunity Zone investments'
);

-- ── Update surviving UTMA item ─────────────────────────────────────────────────
UPDATE public.financial_checklist_items
SET
  category = 'Investing for Your Child',
  description = 'A custodial brokerage account lets you invest stocks, ETFs, and index funds in your child''s name. Assets transfer to them at age 18–21 depending on your state.',
  why_it_matters = 'Gives your child a head start with real market investments — no contribution limits, no restrictions on what the money is used for.',
  recommended_timing = 'First year',
  sort_order = 60
WHERE title = 'Open a custodial brokerage account (UTMA/UGMA)';

-- ── Insert new comprehensive checklist items ───────────────────────────────────
INSERT INTO public.financial_checklist_items
  (category, title, description, recommended_timing, why_it_matters, external_resource_url, annual_limit_note, sort_order)
VALUES

  -- Immediate Steps (sort 1–10)
  ('Immediate Steps', 'Add baby to your health insurance',
   'Most employer health plans give you a 30-day special enrollment window after birth. Contact HR or your insurance provider right away.',
   'Within 30 days of birth',
   'Missing this window can leave your baby uninsured until the next open enrollment — a costly mistake.',
   'https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/',
   NULL, 1),

  ('Immediate Steps', 'Apply for baby''s Social Security number',
   'You can request an SSN on your hospital''s birth certificate application, or apply directly at a Social Security office after birth.',
   'At birth',
   'Required for claiming your child as a dependent on taxes, opening financial accounts, and future government benefits.',
   'https://www.ssa.gov/ssnumber/',
   NULL, 2),

  ('Immediate Steps', 'Update beneficiaries on all your accounts',
   'Review and update beneficiaries on retirement accounts (401k, IRA), life insurance policies, and bank accounts to reflect your new family.',
   'First month',
   'Without an update, assets may pass to an outdated beneficiary (e.g., a parent) instead of your spouse or child.',
   NULL,
   NULL, 3),

  ('Immediate Steps', 'Build or top up your emergency fund',
   'Aim for 3–6 months of household expenses in a high-yield savings account. If starting from zero, $500–$1,000 is a meaningful first goal.',
   'First 3 months',
   'Unexpected medical bills, equipment needs, or reduced income during parental leave can strain finances quickly. A cushion prevents debt.',
   'https://www.consumerfinance.gov/an-cfpb-guide-to-financial-well-being/',
   NULL, 4),

  ('Immediate Steps', 'Create or update a basic will',
   'A will lets you name a legal guardian for your child and specify how your assets should be distributed. Many online tools make this affordable.',
   'Before 3 months',
   'Without a will, a court decides who raises your child. This is the single most important legal document new parents need.',
   'https://www.nolo.com/legal-encyclopedia/making-will-with-minor-children.html',
   NULL, 5),

  -- Insurance (sort 11–20)
  ('Insurance', 'Review your life insurance coverage',
   'A 20-year term life policy typically costs $15–30/month for healthy adults in their 20s–30s. Coverage of 10–12× your annual income is a common guideline.',
   'First 3 months',
   'Your income now supports another life. A term policy ensures your family can maintain their standard of living if something happens to you.',
   'https://www.nerdwallet.com/article/insurance/how-much-life-insurance-do-i-need',
   NULL, 11),

  ('Insurance', 'Check your short-term disability coverage',
   'Short-term disability insurance replaces 60–70% of your income if you''re unable to work due to illness or injury. Many employers offer this as a benefit.',
   'Before birth if possible',
   'Often overlooked by new parents, disability is more likely than death to interrupt your income during your working years.',
   'https://www.investopedia.com/terms/s/shorttermdisability.asp',
   NULL, 12),

  ('Insurance', 'Know your health plan''s deductible and out-of-pocket maximum',
   'Review your plan''s deductible, copays, and annual out-of-pocket maximum. Consider a Health Savings Account (HSA) if you have a high-deductible plan.',
   'Open enrollment / annually',
   'Knowing your financial ceiling for healthcare costs helps you budget and avoid surprise bills — especially important in baby''s first year.',
   'https://www.healthcare.gov/glossary/out-of-pocket-maximum-limit/',
   'HSA contribution limits: $4,300/individual, $8,550/family (2025)', 13),

  -- Education Savings (sort 21–30)
  ('Education Savings (529)', 'Open a 529 college savings plan',
   'A 529 is a tax-advantaged account for education expenses. Earnings grow tax-free and withdrawals for qualified education costs are never taxed. Many states let you open one for under $25.',
   'First 6 months',
   'The earlier you start, the more compound growth works in your favour. Opening the account even with a small amount sets the habit.',
   'https://www.savingsforcollege.com/intro-to-529s/what-is-a-529-plan',
   'Contributions up to $19,000/year ($38,000 married) qualify for the annual gift tax exclusion (2025)', 21),

  ('Education Savings (529)', 'Set up automatic monthly 529 contributions',
   'Even $25–50/month invested consistently in a 529 from birth adds up significantly by college age.',
   'After opening 529',
   '$25/month for 18 years at an average 7% return grows to approximately $11,000. $100/month becomes ~$45,000.',
   NULL,
   NULL, 22),

  ('Education Savings (529)', 'Research your state''s 529 tax deduction or credit',
   '34 states plus D.C. offer a state income tax deduction or credit for contributions to their 529 plan. Some states (e.g., NY, IL) offer deductions for any state''s plan.',
   'Before year-end',
   'A state tax deduction on 529 contributions can reduce your tax bill — essentially free money on top of the tax-free growth.',
   'https://www.savingsforcollege.com/article/how-much-is-your-state-s-529-plan-tax-deduction-really-worth',
   NULL, 23),

  -- Investing for Your Child (sort 61–70; 60 = UTMA item already updated above)
  ('Investing for Your Child', 'Open a Custodial Roth IRA for your child',
   'If your child has earned income (e.g., modeling, acting, or being paid for chores by a business), you can open a custodial Roth IRA. Contributions equal the child''s earned income, up to the annual IRA limit.',
   'When child has earned income',
   'Tax-free growth for decades — even $1,000 contributed in childhood compounds to tens of thousands by retirement.',
   'https://www.irs.gov/retirement-plans/roth-iras',
   'Annual contribution limit: lesser of $7,000 (2025) or child''s earned income', 61),

  ('Investing for Your Child', 'Understand Kiddie Tax rules for custodial accounts',
   'The "kiddie tax" (IRC §1(g)) taxes a child''s unearned income above a threshold at the parent''s marginal rate. For 2025, the first ~$1,350 of unearned income is tax-free.',
   'Before investing in UTMA/UGMA',
   'Knowing the kiddie tax thresholds helps you plan how much to invest in a custodial account versus other vehicles.',
   'https://www.irs.gov/taxtopics/tc553',
   'Kiddie tax threshold: $1,350 tax-free, next $1,350 at child''s rate, above that at parent''s rate (2025)', 62),

  -- Tax Benefits (sort 71–80)
  ('Tax Benefits for Parents', 'Claim the Child Tax Credit',
   'You can claim up to $2,000 per qualifying child under 17 on your federal tax return. Up to $1,700 may be refundable as the Additional Child Tax Credit.',
   'Annual tax filing',
   'One of the most significant tax breaks available to parents — don''t leave money on the table.',
   'https://www.irs.gov/credits-deductions/individuals/child-tax-credit',
   NULL, 71),

  ('Tax Benefits for Parents', 'Open or maximise a Dependent Care FSA',
   'A Dependent Care FSA lets you pay for eligible childcare (daycare, preschool, after-school care) with pre-tax dollars through your employer.',
   'Open enrollment',
   'Using pre-tax dollars for childcare effectively gives you a 20–35% discount depending on your tax bracket.',
   'https://www.irs.gov/publications/p503',
   '$5,000/year pre-tax limit (married filing jointly or single); $2,500 if married filing separately', 72),

  ('Tax Benefits for Parents', 'Claim the Child and Dependent Care Credit',
   'Even without an FSA, you may claim a federal tax credit of 20–35% of up to $3,000 in childcare expenses for one child ($6,000 for two or more).',
   'Tax season',
   'If your employer doesn''t offer a Dependent Care FSA, this credit is your next best option for reducing the cost of childcare.',
   'https://www.irs.gov/credits-deductions/individuals/child-and-dependent-care-credit-information',
   NULL, 73),

  -- Estate Planning (sort 81–90)
  ('Estate Planning', 'Formally designate a guardian in your will',
   'Naming a guardian in a legally valid will is the only reliable way to specify who should raise your child if both parents pass away.',
   'Before baby turns 1',
   'Without a named guardian, a family court makes the decision — potentially choosing someone you wouldn''t have chosen.',
   'https://www.nolo.com/legal-encyclopedia/naming-guardian-will.html',
   NULL, 81),

  ('Estate Planning', 'Review or establish power of attorney and healthcare directive',
   'A durable power of attorney designates someone to handle your finances if you''re incapacitated. A healthcare directive (living will) documents your medical wishes.',
   'Year 1',
   'New parents focus on baby''s safety, but your own incapacity — however unlikely — would create chaos for your family without these documents.',
   'https://www.nolo.com/legal-encyclopedia/power-of-attorney',
   NULL, 82),

  ('Estate Planning', 'Consider a revocable living trust',
   'A living trust can hold assets for your child''s benefit and avoid the public, time-consuming probate process. Often recommended when assets exceed ~$150,000.',
   'Within first 2 years',
   'Ensures assets pass directly and privately to your child without court involvement, and lets you set conditions (e.g., distributed at age 25).',
   'https://www.nolo.com/legal-encyclopedia/living-trust-faq.html',
   NULL, 83);
