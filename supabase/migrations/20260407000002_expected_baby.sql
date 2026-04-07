-- Add is_expected flag to children table
-- Allows users who haven't had their baby yet to set up the app with an expected due date

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS is_expected boolean NOT NULL DEFAULT false;
