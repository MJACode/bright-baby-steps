-- Normalize legacy diaper_type values. The quick-log FAB and chat quick-log
-- wrote 'mixed' for wet+dirty diapers while DiapersPage writes and counts
-- 'both', so 'mixed' rows were missing from wet totals and rendered as dirty.
-- Write paths were fixed in the app (June 2026 UX review, Phase C follow-ups);
-- this normalizes any rows logged by older bundles. Idempotent; no constraint
-- is added because not-yet-updated clients may still write 'mixed' — the app
-- also tolerates 'mixed' on read.
UPDATE public.diaper_logs
SET diaper_type = 'both'
WHERE diaper_type = 'mixed';
