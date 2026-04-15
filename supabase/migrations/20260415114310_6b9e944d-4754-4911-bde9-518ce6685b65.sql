CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert audit logs for own company"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE INDEX idx_audit_logs_company_id ON public.audit_logs (company_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);