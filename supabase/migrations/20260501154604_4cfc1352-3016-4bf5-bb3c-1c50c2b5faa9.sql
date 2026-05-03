-- Storage: drop overly permissive policies on bucket "uploads"
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
-- Keep "Users can delete own uploads" — it already enforces folder ownership.

-- Recreate strict, folder-scoped policies (path layout: <user_id>/...)
CREATE POLICY "uploads_select_own_folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "uploads_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "uploads_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- file_uploads: tighten roles from {public} to {authenticated}.
DROP POLICY IF EXISTS "Users can insert uploads" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can view own uploads" ON public.file_uploads;

CREATE POLICY "Users can insert uploads"
  ON public.file_uploads FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can view own uploads"
  ON public.file_uploads FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );
