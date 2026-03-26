
-- Add processing_error column to file_uploads
ALTER TABLE public.file_uploads ADD COLUMN processing_error text;

-- Create file_extracted_data table
CREATE TABLE public.file_extracted_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_upload_id uuid NOT NULL REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data_category text NOT NULL DEFAULT 'otro',
  extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  row_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.file_extracted_data ENABLE ROW LEVEL SECURITY;

-- Users can view extracted data from their company
CREATE POLICY "Users can view own extracted data"
  ON public.file_extracted_data
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- Admins can delete extracted data
CREATE POLICY "Admins can delete extracted data"
  ON public.file_extracted_data
  FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id() AND has_role(auth.uid(), 'admin'));

-- Service role inserts (edge function uses service role key)
CREATE POLICY "Service can insert extracted data"
  ON public.file_extracted_data
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

-- Allow update on file_uploads for status changes (needed by edge function via service role)
CREATE POLICY "Users can update own uploads"
  ON public.file_uploads
  FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(), 'admin'));
