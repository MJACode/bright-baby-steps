
-- Partner invitations table
CREATE TABLE public.partner_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partner access table (active partnerships)
CREATE TABLE public.partner_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  UNIQUE(owner_id, partner_id)
);

-- Enable RLS
ALTER TABLE public.partner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_access ENABLE ROW LEVEL SECURITY;

-- RLS for partner_invitations: owners can manage their invitations
CREATE POLICY "Owners can manage own invitations"
  ON public.partner_invitations FOR ALL
  USING (auth.uid() = owner_id);

-- Anyone authenticated can read an invitation by code (for accepting)
CREATE POLICY "Authenticated users can read invitations by code"
  ON public.partner_invitations FOR SELECT
  TO authenticated
  USING (true);

-- RLS for partner_access: owners and partners can see their access records
CREATE POLICY "Users can view own partner access"
  ON public.partner_access FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = partner_id);

CREATE POLICY "Owners can manage partner access"
  ON public.partner_access FOR ALL
  USING (auth.uid() = owner_id);

-- Partners can insert (when accepting invite)
CREATE POLICY "Partners can insert own access"
  ON public.partner_access FOR INSERT
  WITH CHECK (auth.uid() = partner_id);

-- Security definer function to check if a user has partner access to a given parent's data
CREATE OR REPLACE FUNCTION public.has_partner_access(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_access
    WHERE partner_id = _user_id
      AND owner_id = _owner_id
      AND status = 'active'
  )
$$;

-- Security definer function to check if user can access a child
CREATE OR REPLACE FUNCTION public.can_access_child(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.children
    WHERE id = _child_id AND parent_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.children c
    JOIN public.partner_access pa ON pa.owner_id = c.parent_id
    WHERE c.id = _child_id
      AND pa.partner_id = _user_id
      AND pa.status = 'active'
  )
$$;
