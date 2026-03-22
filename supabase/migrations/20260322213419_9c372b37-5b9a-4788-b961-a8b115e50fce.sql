
-- Drop the constraint that depends on btree_gist in public
ALTER TABLE public.sleep_logs DROP CONSTRAINT IF EXISTS no_overlapping_sleep;

-- Move btree_gist to extensions schema
DROP EXTENSION IF EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- Recreate the constraint (now using btree_gist from extensions schema)
ALTER TABLE public.sleep_logs ADD CONSTRAINT no_overlapping_sleep
  EXCLUDE USING gist (child_id WITH =, tstzrange(started_at, ended_at) WITH &&)
  WHERE (ended_at IS NOT NULL);
