-- T5 — rights-request inbox per the legal review.
--
-- Privacy § 7 promises a 30-day SLA to respond to GDPR / CCPA / CPRA / COPPA
-- rights requests, plus a verification step. This table is the audit trail.
-- v1 operations: the team triages by querying this table from the Supabase
-- dashboard. A future admin UI is tracked separately.
--
-- Public can INSERT (the form on /rights-request is open to non-authenticated
-- users — important for users whose accounts have already been deleted).
-- Requesters can SELECT only their own rows by email match. No public UPDATE
-- or DELETE: those happen via service-role from the team.

CREATE TABLE IF NOT EXISTS public.rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN (
    'access',
    'correction',
    'deletion',
    'portability',
    'objection',
    'sensitive_pi_limit',
    'withdraw_consent',
    'coppa_review',
    'coppa_delete',
    'coppa_refuse_further',
    'other'
  )),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',
    'acknowledged',
    'verified',
    'in_progress',
    'completed',
    'rejected',
    'duplicate'
  )),
  jurisdiction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledgement_due_at timestamptz NOT NULL DEFAULT (now() + interval '10 days'),
  response_due_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  acknowledged_at timestamptz,
  verified_at timestamptz,
  completed_at timestamptz,
  admin_notes text
);

CREATE INDEX IF NOT EXISTS rights_requests_status_idx ON public.rights_requests (status);
CREATE INDEX IF NOT EXISTS rights_requests_email_idx ON public.rights_requests (lower(email));
CREATE INDEX IF NOT EXISTS rights_requests_response_due_at_idx ON public.rights_requests (response_due_at)
  WHERE status NOT IN ('completed', 'rejected', 'duplicate');

ALTER TABLE public.rights_requests ENABLE ROW LEVEL SECURITY;

-- Public can submit a request. Required so users without active sessions
-- (e.g., already-deleted accounts) can still exercise rights.
CREATE POLICY "Anyone can submit a rights request"
  ON public.rights_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'received'
    AND acknowledged_at IS NULL
    AND verified_at IS NULL
    AND completed_at IS NULL
    AND admin_notes IS NULL
  );

-- Authenticated users can read their own rows by email match.
CREATE POLICY "Users read own rights requests"
  ON public.rights_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

COMMENT ON TABLE public.rights_requests IS
  'GDPR Art. 15-22 / CCPA / CPRA / COPPA rights requests inbox. Privacy § 7 '
  'promises 10-day acknowledgement and 30-day response. Triage from the '
  'Supabase dashboard; a custom admin UI is a follow-up.';
