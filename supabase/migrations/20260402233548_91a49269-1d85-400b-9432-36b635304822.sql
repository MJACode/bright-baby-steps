
-- 1. Add missing INSERT policy on partner_access
CREATE POLICY "Partners can insert own access"
ON public.partner_access FOR INSERT
TO authenticated
WITH CHECK (partner_id = auth.uid());

-- 2. Add missing DELETE policy on partner_access
CREATE POLICY "Owners can delete partner access"
ON public.partner_access FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- 3. Make milestone-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'milestone-photos';

-- 4. Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Milestone photos are publicly accessible" ON storage.objects;

-- 5. Add private SELECT policy scoped to authenticated owner
CREATE POLICY "Users can view own milestone photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'milestone-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
