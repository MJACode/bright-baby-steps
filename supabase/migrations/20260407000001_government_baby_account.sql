-- Add government child savings account item (MAGA Accounts / One Big Beautiful Bill Act 2025)
-- Children born January 1, 2025 – December 31, 2028 may be eligible for a $1,000 federal
-- government seed contribution into a new tax-advantaged investment account.

INSERT INTO public.financial_checklist_items
  (category, title, description, recommended_timing, why_it_matters, external_resource_url, annual_limit_note, sort_order)
VALUES
  ('Government Programs',
   'Claim the $1,000 Government Baby Savings Account',
   'The "One Big Beautiful Bill Act" (2025) proposes a new federal child savings account (also called "MAGA Accounts" — Money Account for Growth and Advancement) seeded with a $1,000 government contribution for every child born between January 1, 2025 and December 31, 2028. Parents can add up to $5,000/year. Funds grow tax-advantaged and can be used for education, a first home purchase, or starting a business.',
   'As soon as eligible — check status',
   'A $1,000 head start invested from birth at 7% average return grows to over $4,000 by age 18. Combined with family contributions, this could be a significant financial foundation for your child.',
   'https://www.congress.gov/bill/119th-congress/house-bill/1',
   'Pending legislation as of 2025 — confirm final rules before acting. Up to $5,000/year in additional parent contributions proposed.',
   0);
