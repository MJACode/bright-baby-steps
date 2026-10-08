-- child_owner_is_premium(_child_id): is this child's family on Flare+?
--
-- Problem: `subscriptions` RLS is `auth.uid() = user_id`, so a partner
-- (coparent / caregiver / viewer) on a Flare+ owner's account reads no row and
-- usePremium() reports free. Founder decision 2026-10-08: partners on a Flare+
-- family see the Flare+ nap & feed predictions (client-side math, no AI cost).
--
-- Contract: returns true iff
--   1. the caller can access the child (can_access_child(auth.uid(), _child_id)
--      -- owner, or an active partner within the owner's seat entitlement), AND
--   2. the child's owner (children.parent_id) holds an active/trialing 'plus'
--      subscription (owner_has_plus -- mirrors usePremium.isPremium exactly:
--      tier = 'plus' AND status IN ('active','trialing'); tier 'pro' is NOT
--      premium on the client either).
-- Every other case returns false, never an error and never NULL: unknown child,
-- no access, anon caller (auth.uid() NULL -> can_access_child NULL -> COALESCE).
-- So it discloses one boolean, only about children the caller can already read.
--
-- SECURITY DEFINER because the caller cannot read the owner's subscriptions row
-- or call owner_has_plus (EXECUTE revoked from client roles in
-- 20260830010000). Runs as the function owner, so the nested calls need no
-- client grant. search_path pinned.
--
-- Grants: hosted Supabase's pg_default_acl grants EXECUTE on new public
-- functions directly to anon/authenticated (REVOKE FROM PUBLIC alone is a
-- no-op -- see tasks/lessons-backend.md 2026-10-01). Revoke from PUBLIC and
-- anon explicitly, then grant to authenticated only.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT are re-runnable no-ops.
-- No new table: nothing to add to _purge_user_data / delete_user_account.

CREATE OR REPLACE FUNCTION public.child_owner_is_premium(_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.can_access_child(auth.uid(), _child_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = _child_id
        AND public.owner_has_plus(c.parent_id)
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.child_owner_is_premium(uuid) IS
  'True when the caller can access _child_id (can_access_child) and the '
  'child''s owner holds an active or trialing Flare+ subscription '
  '(owner_has_plus, which mirrors usePremium.isPremium). False otherwise, '
  'including no access / unknown child / anon. Lets partners see the family''s '
  'Flare+ state without reading the owner''s subscriptions row.';

REVOKE ALL ON FUNCTION public.child_owner_is_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.child_owner_is_premium(uuid) TO authenticated;
