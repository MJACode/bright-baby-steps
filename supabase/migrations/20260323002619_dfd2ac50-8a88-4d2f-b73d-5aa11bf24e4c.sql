
-- Update any existing 'concern_flagged' statuses to 'not_yet'
UPDATE public.child_speech SET status = 'not_yet' WHERE status = 'concern_flagged';

-- Drop existing status check constraint if any, and add new one without concern_flagged
DO $$
BEGIN
  -- Try to drop existing constraint
  BEGIN
    ALTER TABLE public.child_speech DROP CONSTRAINT IF EXISTS child_speech_status_check;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

ALTER TABLE public.child_speech ADD CONSTRAINT child_speech_status_check 
  CHECK (status = ANY (ARRAY['achieved', 'emerging', 'not_yet']));
