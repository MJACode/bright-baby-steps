-- Make the once-per-(child, finance type) backstop safe under overlapping
-- cron runs. Two concurrent transactions can't see each other's uncommitted
-- rows, so the EXISTS check alone could let both insert. A transaction-scoped
-- advisory lock serializes them; under READ COMMITTED the second waits and its
-- EXISTS then sees the first one's committed row.
CREATE OR REPLACE FUNCTION public.skip_duplicate_finance_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.child_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.child_id::text || ':' || NEW.type));
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE child_id = NEW.child_id
      AND type = NEW.type
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.skip_duplicate_finance_notification() FROM authenticated;
