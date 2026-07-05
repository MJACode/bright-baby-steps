-- 20260425000000_onboarding_profile_fields was recorded in
-- schema_migrations but its DDL never ran on the live project; the
-- onboarding completion update (primary_interest + has_partner) had
-- been failing as a result. Idempotent re-apply.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_interest text,
  ADD COLUMN IF NOT EXISTS has_partner boolean;
