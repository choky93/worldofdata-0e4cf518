
CREATE TABLE public.alert_states (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  UNIQUE(company_id, alert_key)
);

ALTER TABLE public.alert_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company alert states"
  ON public.alert_states FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can upsert own company alert states"
  ON public.alert_states FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own company alert states"
  ON public.alert_states FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id());
