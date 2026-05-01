ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_interest text,
  ADD COLUMN IF NOT EXISTS has_partner boolean;
