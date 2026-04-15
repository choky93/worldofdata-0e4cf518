-- Create cleanup_logs table
CREATE TABLE public.cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  files_deleted integer NOT NULL DEFAULT 0,
  bytes_freed bigint NOT NULL DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb,
  executed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cleanup_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view their company's cleanup logs
CREATE POLICY "Admins can view cleanup logs"
  ON public.cleanup_logs
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Service role inserts (no authenticated insert policy needed — edge function uses service role)