-- No paid placement on the Trump Account card: it is a free government
-- deposit, and a paid "Open with" button beside it risks implying a firm is
-- needed to claim it (legal-review-log 2026-09-30, C2).
ALTER TABLE public.finance_account_sponsors
  DROP CONSTRAINT IF EXISTS finance_account_sponsors_no_trump_check;
ALTER TABLE public.finance_account_sponsors
  ADD CONSTRAINT finance_account_sponsors_no_trump_check CHECK (account_key <> 'trump');

COMMENT ON TABLE public.finance_account_sponsors IS
  'No row may be is_active = true until outside securities counsel signs off (legal-review-log 2026-06-20 / 2026-09-30).';
