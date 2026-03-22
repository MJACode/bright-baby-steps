
-- Remove the insecure INSERT policy that allows arbitrary partner_access creation
DROP POLICY "Partners can insert own access" ON public.partner_access;

-- Create a secure RPC to accept invitations atomically
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  -- Find and validate the invitation
  SELECT * INTO _invite
  FROM public.partner_invitations
  WHERE invite_code = _invite_code
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  IF _invite.owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot accept your own invitation';
  END IF;

  -- Create the partner access record
  INSERT INTO public.partner_access (owner_id, partner_id, status)
  VALUES (_invite.owner_id, auth.uid(), 'active')
  ON CONFLICT (owner_id, partner_id) DO UPDATE SET status = 'active', revoked_at = NULL;

  -- Mark invitation as accepted
  UPDATE public.partner_invitations
  SET status = 'accepted', accepted_by = auth.uid(), updated_at = now()
  WHERE id = _invite.id;
END;
$$;
