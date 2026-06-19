-- Refresh stale US tax-year figures in the financial checklist.
--
-- Source: IRS Rev. Proc. 2025-32 (TY2026 inflation adjustments), Rev. Proc.
-- 2024-40 (TY2025), Rev. Proc. 2025-19 (HSA TY2026), Notice 2025-67 (HSA),
-- and OBBBA 2025 (Child Tax Credit -> $2,200 starting TY2025; Dependent Care
-- FSA -> $7,500 MFJ starting TY2026, if the employer plan adopts it).
--
-- This migration does NOT edit the original applied migration
-- (20260407000000_financial_checklist_overhaul.sql). It UPDATEs the affected
-- `financial_checklist_items.annual_limit_note` rows in place, matched by
-- `title` (stable) rather than id. Every statement is a plain idempotent
-- UPDATE -- re-running is a no-op once the rows hold the target text.
--
-- NOTE: the gift-tax annual exclusion ($19,000 / $38,000 married) and the
-- kiddie-tax thresholds ($1,350 floor / $2,700 parent-rate threshold) are
-- INTENTIONALLY FLAT 2025 -> 2026 -- they did not change year over year.
-- 529 superfunding (5-yr) at $95,000 single / $190,000 married is likewise
-- unchanged and is not stamped here.

-- ── HSA contribution limits -> TY2026 ──────────────────────────────────────────
UPDATE public.financial_checklist_items
SET annual_limit_note = 'HSA contribution limits: $4,400/individual, $8,750/family (2026)'
WHERE title = 'Know your health plan''s deductible and out-of-pocket maximum';

-- ── 529 / gift-tax annual exclusion -> stamp current year (figure unchanged) ────
UPDATE public.financial_checklist_items
SET annual_limit_note = 'Contributions up to $19,000/year ($38,000 married) qualify for the annual gift tax exclusion (2026; unchanged from 2025)'
WHERE title = 'Open a 529 college savings plan';

-- ── Custodial Roth IRA contribution limit -> TY2026 ────────────────────────────
UPDATE public.financial_checklist_items
SET annual_limit_note = 'Annual contribution limit: lesser of $7,500 (2026; up from $7,000 in 2025) or child''s earned income'
WHERE title = 'Open a Custodial Roth IRA for your child';

-- ── Kiddie tax -> stamp current year (thresholds unchanged) ────────────────────
UPDATE public.financial_checklist_items
SET annual_limit_note = 'Kiddie tax threshold: $1,350 tax-free, next $1,350 at child''s rate, above that at parent''s rate (2026; unchanged from 2025)'
WHERE title = 'Understand Kiddie Tax rules for custodial accounts';

-- ── Child Tax Credit -> OBBBA 2025 ($2,200; was $2,000) ────────────────────────
-- Also refresh the item description so the $2,000 figure in the body text is not
-- left stale alongside the corrected note.
UPDATE public.financial_checklist_items
SET
  description = 'You can claim up to $2,200 per qualifying child under 17 on your federal tax return (raised from $2,000 by the One Big Beautiful Bill Act, effective tax year 2025). Up to $1,700 may be refundable as the Additional Child Tax Credit. The credit phases out above $200,000 MAGI (single) / $400,000 (married filing jointly).',
  annual_limit_note = '$2,200 per child; up to $1,700 refundable; phaseout at $200,000 MAGI single / $400,000 MFJ (2025–2026)'
WHERE title = 'Claim the Child Tax Credit';

-- ── Dependent Care FSA -> TY2025 $5,000 / TY2026 $7,500 (OBBBA, plan-dependent) ─
UPDATE public.financial_checklist_items
SET annual_limit_note = '$5,000/year pre-tax limit MFJ or single ($2,500 if married filing separately) in 2025; rises to $7,500 MFJ / $3,750 MFS in 2026 if your employer''s plan adopts the OBBBA increase'
WHERE title = 'Open or maximise a Dependent Care FSA';
