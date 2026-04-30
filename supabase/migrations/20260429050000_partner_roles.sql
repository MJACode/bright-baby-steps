-- PR #5 — Family-sync onboarding (Direction A)
-- Adds scoped roles to partner_access + partner_invitations, threads role
-- through the accept RPC, and exposes a helper to read effective permissions.
--
-- Safe to run alongside existing data: defaults to 'coparent' so today's
-- partners keep full access. New invites can specify caregiver / viewer.
--
-- Timestamp bumped from the handoff's 20260429040000 (collided with the
-- custom_milestones_photo migration).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_role') THEN
    CREATE TYPE public.partner_role AS ENUM ('coparent', 'caregiver', 'viewer');
  END IF;
END$$;

ALTER TABLE public.partner_invitations
  ADD COLUMN IF NOT EXISTS role public.partner_role NOT NULL DEFAULT 'coparent',
  ADD COLUMN IF NOT EXISTS invitee_label text;

ALTER TABLE public.partner_access
  ADD COLUMN IF NOT EXISTS role public.partner_role NOT NULL DEFAULT 'coparent',
  ADD COLUMN IF NOT EXISTS label text;

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

  INSERT INTO public.partner_access (owner_id, partner_id, status, role, label)
  VALUES (_invite.owner_id, auth.uid(), 'active', _invite.role, _invite.invitee_label)
  ON CONFLICT (owner_id, partner_id)
  DO UPDATE SET
    status = 'active',
    revoked_at = NULL,
    role = EXCLUDED.role,
    label = COALESCE(EXCLUDED.label, public.partner_access.label);

  UPDATE public.partner_invitations
  SET status = 'accepted', accepted_by = auth.uid(), updated_at = now()
  WHERE id = _invite.id;
END;
$$;

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
  SELECT id, owner_id, status, expires_at, role, invitee_label
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
    'expires_at', _invite.expires_at,
    'role', _invite.role,
    'invitee_label', _invite.invitee_label
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_can_write(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = _owner_id
    OR EXISTS (
      SELECT 1 FROM public.partner_access
      WHERE partner_id = auth.uid()
        AND owner_id = _owner_id
        AND status = 'active'
        AND role IN ('coparent', 'caregiver')
    );
$$;
