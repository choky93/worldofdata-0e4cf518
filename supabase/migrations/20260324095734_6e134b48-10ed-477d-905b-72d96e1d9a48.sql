
-- Add active column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Allow admins to view all profiles in same company (needed for team page)
CREATE POLICY "Admins can view company profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  )
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update profiles in same company (for activate/deactivate)
CREATE POLICY "Admins can update company profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  )
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Storage policies for uploads bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Users can view own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'uploads');

CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
