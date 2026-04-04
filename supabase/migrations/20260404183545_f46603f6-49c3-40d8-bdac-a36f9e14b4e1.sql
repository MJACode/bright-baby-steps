-- Fix 1: Remove dangerous INSERT policy on partner_access
-- The accept_partner_invitation RPC (SECURITY DEFINER) already handles
-- inserting into partner_access after validating the invitation.
-- This public INSERT policy allows privilege escalation.
DROP POLICY "Partners can insert own access" ON public.partner_access;

-- Fix 2: Re-scope partner_invitations policy to authenticated role
-- and add explicit WITH CHECK
DROP POLICY "Owners can manage own invitations" ON public.partner_invitations;
CREATE POLICY "Owners can manage own invitations"
  ON public.partner_invitations FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);