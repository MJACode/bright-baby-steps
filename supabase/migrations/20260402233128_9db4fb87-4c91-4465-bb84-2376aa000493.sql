
-- Add photo_url to child_speech
ALTER TABLE public.child_speech ADD COLUMN photo_url text;

-- Add photo_url to custom_milestones
ALTER TABLE public.custom_milestones ADD COLUMN photo_url text;

-- Create storage bucket for milestone photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('milestone-photos', 'milestone-photos', true);

-- Allow public read access
CREATE POLICY "Milestone photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'milestone-photos');

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload milestone photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own photos
CREATE POLICY "Users can update own milestone photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own photos
CREATE POLICY "Users can delete own milestone photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
