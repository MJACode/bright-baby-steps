-- RPC used by the reactivate-nudge edge function to find children whose
-- family hasn't logged anything in the cutoff window.
-- SECURITY DEFINER so the service-role-keyed function can call it.

CREATE OR REPLACE FUNCTION public.users_with_no_logs_since(since timestamptz)
RETURNS TABLE(user_id uuid, child_id uuid, child_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.parent_id, c.id, c.name
  FROM public.children c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.feeding_logs WHERE child_id = c.id AND logged_at > since
    UNION ALL
    SELECT 1 FROM public.sleep_logs WHERE child_id = c.id AND started_at > since
    UNION ALL
    SELECT 1 FROM public.diaper_logs WHERE child_id = c.id AND logged_at > since
  );
$$;
