
-- 1. Drop the overly permissive SELECT policy on partner_invitations
DROP POLICY IF EXISTS "Authenticated users can read invitations by code" ON partner_invitations;

-- 2. Create a secure RPC for invite code lookup (returns minimal info, no invite_code exposed)
CREATE OR REPLACE FUNCTION public.lookup_partner_invitation(_invite_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  SELECT id, owner_id, status, expires_at
  INTO _invite
  FROM public.partner_invitations
  WHERE invite_code = _invite_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', _invite.id,
    'owner_id', _invite.owner_id,
    'status', _invite.status,
    'expires_at', _invite.expires_at
  );
END;
$$;

-- 3. Harden has_partner_access to only allow auth.uid() as _user_id
CREATE OR REPLACE FUNCTION public.has_partner_access(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.partner_access
    WHERE partner_id = _user_id
      AND owner_id = _owner_id
      AND status = 'active'
  );
$$;

-- 4. Block direct INSERT/DELETE on partner_access (force through RPC only)
DROP POLICY IF EXISTS "Owners can manage partner access" ON partner_access;

CREATE POLICY "Owners can update partner access"
  ON partner_access FOR UPDATE
  USING (auth.uid() = owner_id);
