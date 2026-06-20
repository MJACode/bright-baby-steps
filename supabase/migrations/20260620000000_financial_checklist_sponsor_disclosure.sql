-- Financial-tab upgrade (1/2): add the sponsor_disclosure column.
--
-- Sponsored checklist items need a neutral, one-line disclosure that states the
-- relationship is paid AND that the placement is not an endorsement. This is a
-- separate field from the existing sponsor_* CTA columns (added in
-- 20260407000000) so the disclosure copy can be rendered independently of the
-- CTA button label/url. Nullable, no default: only sponsored rows carry it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on re-run.

ALTER TABLE public.financial_checklist_items
  ADD COLUMN IF NOT EXISTS sponsor_disclosure text;
