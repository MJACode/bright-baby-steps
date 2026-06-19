-- Reconcile public.financial_checklist_items with the live production seed.
--
-- Why: the earlier seed migrations (20260308215351, 20260407000000,
-- 20260619000000) drifted from production. Live carries 16 canonical rows with
-- stable UUIDs that parent_financial_checklist.checklist_item_id FKs to, plus
-- titles/copy that diverge from those files (e.g. "Add your child to health
-- insurance", "Build a 3–6 month emergency fund"). A fresh `db reset` from the
-- repo would otherwise reproduce the stale rows — which silently broke the
-- finance Next-Step feed's seedTitle→UUID resolution (see useNextSteps.tsx).
--
-- This migration is the canonical source of truth for the table. It UPSERTs the
-- 16 live rows by their real id (PK) and removes anything else, so a from-scratch
-- build matches production exactly. It is a no-op against live (rows already
-- match; the trailing DELETE matches nothing). Content is reproduced verbatim
-- from production — this is a reconciliation, not a content edit. Refresh the
-- dated figures (529 gift exclusion, DCFSA limit) in a separate, deliberate
-- migration if/when they need updating.

INSERT INTO public.financial_checklist_items
  (id, category, title, description, recommended_timing, why_it_matters,
   disclaimer, external_resource_url, annual_limit_note, sort_order)
VALUES
  ('fc3b5898-84c8-4451-924a-de5841181b2e', $f$College Savings$f$, $f$Open a 529 college savings plan$f$,
   $f$A 529 is a tax-advantaged savings account designed specifically for education expenses. Contributions grow tax-free, and withdrawals for qualified education expenses are also tax-free.$f$,
   $f$Within the first 6 months$f$,
   $f$Starting early dramatically increases what you'll have when your child reaches college age. Even small monthly contributions compound significantly over 18 years.$f$,
   $f$This is general educational information, not personalized financial advice. Consult a financial advisor for guidance specific to your situation.$f$,
   $f$https://www.savingforcollege.com$f$,
   $f$Contributions up to $19,000/year ($38,000 married) qualify for the annual gift tax exclusion (2026; unchanged from 2025)$f$, 1),

  ('08ae0699-d90e-4251-bc02-d850e49b345f', $f$College Savings$f$, $f$Name your child as 529 beneficiary$f$,
   $f$After opening a 529, designate your child as the account beneficiary so funds are earmarked for their education.$f$,
   $f$When opening the 529 account$f$,
   $f$Ensures the tax benefits apply correctly and funds can be transferred to a sibling if circumstances change.$f$,
   $f$This is general educational information, not personalized financial advice.$f$,
   $f$https://www.irs.gov/taxtopics/tc313$f$,
   NULL, 2),

  ('a57ac9a4-282b-4f3f-bb32-2fc354fe50ed', $f$Insurance$f$, $f$Review your life insurance coverage$f$,
   $f$A new child changes your life insurance needs. Calculate whether your current coverage would replace your income and cover major expenses (mortgage, childcare, education) if you were no longer here.$f$,
   $f$Within the first 3 months$f$,
   $f$Life insurance is one of the highest-impact financial decisions new parents make. It's inexpensive when you're young and healthy.$f$,
   $f$This is general guidance, not personalized insurance advice. Speak with a licensed insurance professional.$f$,
   $f$https://www.naic.org/consumer_life_insurance.htm$f$,
   NULL, 3),

  ('0e5308b3-fc91-418b-89da-fe3606f0ab4d', $f$Insurance$f$, $f$Add your child to health insurance$f$,
   $f$Newborns must typically be added to a parent's health insurance plan within 30–60 days of birth. Missing this window may require waiting for open enrollment.$f$,
   $f$Immediately — within 30 days of birth$f$,
   $f$Missing the enrollment window can leave your baby uninsured for months.$f$,
   NULL,
   $f$https://www.healthcare.gov/coverage/newborns/$f$,
   $f$Enrollment windows vary by plan. Check your specific plan's special enrollment period.$f$, 4),

  ('2e11d795-00c3-4cc3-a7d7-681883660138', $f$Insurance$f$, $f$Consider disability insurance$f$,
   $f$Disability insurance replaces a portion of your income if you're unable to work due to illness or injury. Many parents overlook this — but your ability to earn is your most valuable asset.$f$,
   $f$Within the first year$f$,
   $f$A disability is more likely than death for working-age adults. Protecting your income protects your family.$f$,
   $f$This is general guidance, not personalized insurance advice. Speak with a licensed insurance professional.$f$,
   $f$https://www.ssa.gov/disability/$f$,
   NULL, 5),

  ('67b94e82-5d71-424b-9d27-b1b4e0eea6af', $f$Estate Planning$f$, $f$Create or update your will$f$,
   $f$A will names a guardian for your child if both parents are unable to care for them. Without a will, the court decides guardianship.$f$,
   $f$Within the first 6 months$f$,
   $f$Naming a guardian is the most important thing a will does for parents of young children. It's a conversation worth having now.$f$,
   $f$This is general guidance. Consult a licensed attorney to create a legally valid will in your state.$f$,
   $f$https://www.americanbar.org/groups/real_property_trust_estate/resources/estate_planning/$f$,
   NULL, 6),

  ('8058e21a-05d9-4550-8e3e-69cd4fa58325', $f$Estate Planning$f$, $f$Name a guardian for your child$f$,
   $f$Formally document who you want to raise your child if both parents pass away or are incapacitated. This is named in your will.$f$,
   $f$Within the first 6 months$f$,
   $f$Without a named guardian in a legal will, a court will make this decision — often not choosing who you would have chosen.$f$,
   $f$Consult a licensed attorney. Guardian designations must be made in a legally valid will.$f$,
   NULL,
   NULL, 7),

  ('c94f2acc-6961-45fc-9e7d-f6a2f5f7f4f1', $f$Estate Planning$f$, $f$Establish or update beneficiary designations$f$,
   $f$Review and update beneficiary designations on life insurance policies, retirement accounts (401k, IRA), and bank accounts. These designations override your will.$f$,
   $f$Within the first 3 months$f$,
   $f$Outdated beneficiary designations are one of the most common estate planning mistakes — assets can pass to the wrong person even with a perfect will.$f$,
   NULL,
   NULL,
   NULL, 8),

  ('9ec05ab1-361b-4e03-a900-8d4311ce3925', $f$Emergency Fund$f$, $f$Build a 3–6 month emergency fund$f$,
   $f$An emergency fund covers unexpected expenses (job loss, medical bills, car repair) without going into debt. The standard recommendation is 3–6 months of living expenses.$f$,
   $f$Ongoing — prioritize in first year$f$,
   $f$Children increase both your expenses and the stakes of financial disruption. An emergency fund is the foundation everything else rests on.$f$,
   $f$This is general educational information, not personalized financial advice.$f$,
   $f$https://www.consumer.gov/articles/1002-making-budget$f$,
   NULL, 9),

  ('77815235-2084-454d-8a23-d98f3cdd7dfa', $f$Government Programs$f$, $f$Understand your Child Tax Credit eligibility$f$,
   $f$Parents may be eligible for federal Child Tax Credit (CTC) for each qualifying dependent child. Eligibility and amounts vary by income.$f$,
   $f$At tax time (first year with child)$f$,
   $f$The Child Tax Credit can meaningfully reduce your tax bill or increase your refund each year.$f$,
   $f$Tax laws change annually. Consult a tax professional or the IRS website for current eligibility and amounts.$f$,
   $f$https://www.irs.gov/credits-deductions/individuals/child-tax-credit$f$,
   $f$CTC amounts and income phase-outs change with tax legislation. Verify at IRS.gov each year.$f$, 10),

  ('29b66bc4-e732-4519-9909-aa4c02d41bb0', $f$Government Programs$f$, $f$Research your state's child-related tax benefits$f$,
   $f$Many states offer additional child tax credits, dependent care deductions, or 529 contribution deductions on top of federal benefits.$f$,
   $f$At tax time (first year with child)$f$,
   $f$State tax benefits are frequently overlooked and can add up to hundreds of dollars per year.$f$,
   $f$Tax laws vary by state and change annually. Consult a tax professional.$f$,
   NULL,
   $f$Verify current state tax benefits with your state's department of revenue.$f$, 11),

  ('60e46382-8123-4b5b-b54c-ccba66b9cf43', $f$Childcare & Benefits$f$, $f$Set up a Dependent Care FSA if available$f$,
   $f$A Dependent Care Flexible Spending Account (FSA) lets you pay for eligible childcare expenses with pre-tax dollars through your employer (if offered). Up to $5,000 per household (2024) can be contributed.$f$,
   $f$During next open enrollment period$f$,
   $f$Pre-tax childcare savings reduce your taxable income. On $5,000 of childcare expenses, this can save $1,000–$1,500 depending on your tax bracket.$f$,
   $f$This is general educational information. Consult your HR department and a tax professional.$f$,
   $f$https://www.irs.gov/publications/p503$f$,
   $f$FSA contribution limits and eligible expenses are set by IRS and may change annually.$f$, 12),

  ('cbb52592-5285-4681-93b1-295b6cc4aec3', $f$Investing for Kids$f$, $f$Open a custodial brokerage account (UTMA/UGMA)$f$,
   $f$A custodial account lets you invest stocks, ETFs, and bonds in your child's name until they reach the age of majority.$f$,
   $f$First 6 months$f$,
   $f$Gives your child a head start with real investments beyond education savings.$f$,
   NULL,
   $f$https://www.investopedia.com/terms/u/utma.asp$f$,
   NULL, 13),

  ('0abe709b-641a-4fd9-904c-04a486436764', $f$Investing for Kids$f$, $f$Consider a Trump-era Roth IRA for your child$f$,
   $f$If your child has earned income (e.g., modeling, acting), you can open a custodial Roth IRA. The TCJA (Trump Tax Cuts & Jobs Act) kept favorable Roth rules.$f$,
   $f$When child has earned income$f$,
   $f$Tax-free growth for decades — even small contributions compound enormously for kids.$f$,
   NULL,
   $f$https://www.irs.gov/retirement-plans/roth-iras$f$,
   NULL, 14),

  ('4345e226-5a6d-4deb-bd51-2d86edd9926f', $f$Investing for Kids$f$, $f$Review Trump-era tax brackets for kiddie tax$f$,
   $f$The Tax Cuts and Jobs Act of 2017 changed how unearned income for children is taxed. Understand the "kiddie tax" rules for custodial accounts.$f$,
   $f$Before investing in custodial accounts$f$,
   $f$Knowing the kiddie tax thresholds helps you plan contributions to UTMA/UGMA accounts wisely.$f$,
   NULL,
   $f$https://www.irs.gov/taxtopics/tc553$f$,
   NULL, 15),

  ('f1e54976-9911-4bd0-903a-89bd99ad2f77', $f$Investing for Kids$f$, $f$Explore Opportunity Zone investments$f$,
   $f$Opportunity Zones, created by the 2017 Tax Cuts and Jobs Act, offer tax benefits for investing in designated low-income areas.$f$,
   $f$When you have capital gains to reinvest$f$,
   $f$Capital gains tax deferral and potential exclusion for long-term holds — a unique wealth-building tool.$f$,
   NULL,
   $f$https://www.irs.gov/credits-deductions/businesses/opportunity-zones$f$,
   NULL, 16)
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

-- Drop any rows not in the canonical set. On live this matches nothing; on a
-- fresh build it removes the randomly-id'd rows seeded by the earlier
-- migrations, leaving exactly the 16 canonical rows above.
DELETE FROM public.financial_checklist_items
WHERE id NOT IN (
  'fc3b5898-84c8-4451-924a-de5841181b2e', '08ae0699-d90e-4251-bc02-d850e49b345f',
  'a57ac9a4-282b-4f3f-bb32-2fc354fe50ed', '0e5308b3-fc91-418b-89da-fe3606f0ab4d',
  '2e11d795-00c3-4cc3-a7d7-681883660138', '67b94e82-5d71-424b-9d27-b1b4e0eea6af',
  '8058e21a-05d9-4550-8e3e-69cd4fa58325', 'c94f2acc-6961-45fc-9e7d-f6a2f5f7f4f1',
  '9ec05ab1-361b-4e03-a900-8d4311ce3925', '77815235-2084-454d-8a23-d98f3cdd7dfa',
  '29b66bc4-e732-4519-9909-aa4c02d41bb0', '60e46382-8123-4b5b-b54c-ccba66b9cf43',
  'cbb52592-5285-4681-93b1-295b6cc4aec3', '0abe709b-641a-4fd9-904c-04a486436764',
  '4345e226-5a6d-4deb-bd51-2d86edd9926f', 'f1e54976-9911-4bd0-903a-89bd99ad2f77'
);
