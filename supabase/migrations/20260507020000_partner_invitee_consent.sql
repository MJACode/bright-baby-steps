-- T3 — partner-invitee consent moment per the legal review.
--
-- An invited co-parent or caregiver becomes a co-controller of the same child
-- record. They need an explicit consent moment, separate from the primary
-- parent's VPC: they must affirm that (a) they are a parent, legal guardian,
-- or invited caregiver, (b) they understand what data they will see, (c) they
-- agree to the Privacy Policy. We record this on partner_access at the moment
-- the invitation is accepted.
--
-- Existing partner_access rows are backfilled with their created_at as a
-- good-faith consent timestamp under the prior single-step accept flow.

ALTER TABLE public.partner_access
  ADD COLUMN IF NOT EXISTS consent_acknowledged_at timestamptz;

UPDATE public.partner_access
SET consent_acknowledged_at = COALESCE(consent_acknowledged_at, created_at)
WHERE consent_acknowledged_at IS NULL;

-- Replace accept_partner_invitation so consent is stamped on the partner_access
-- row at the moment of acceptance. The client now requires the invitee to
-- check a consent box before invoking this RPC; this is a defence-in-depth
-- record.
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
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

  INSERT INTO public.partner_access (owner_id, partner_id, status, role, label, consent_acknowledged_at)
  VALUES (_invite.owner_id, auth.uid(), 'active', _invite.role, _invite.invitee_label, now())
  ON CONFLICT (owner_id, partner_id)
  DO UPDATE SET
    status = 'active',
    revoked_at = NULL,
    role = EXCLUDED.role,
    label = COALESCE(EXCLUDED.label, public.partner_access.label),
    consent_acknowledged_at = COALESCE(public.partner_access.consent_acknowledged_at, now());

  UPDATE public.partner_invitations
  SET status = 'accepted', accepted_by = auth.uid(), updated_at = now()
  WHERE id = _invite.id;
END;
$$;

COMMENT ON COLUMN public.partner_access.consent_acknowledged_at IS
  'Timestamp when the invited partner affirmed they are the parent / legal '
  'guardian / invited caregiver and consented to the data flow. Required by '
  'the May-2026 legal review (T3).';
