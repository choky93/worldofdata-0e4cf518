
-- Diagnostic results table for strategic onboarding
CREATE TABLE public.diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pain_point text,
  maturity_classification text,
  maturity_scores jsonb DEFAULT '{}'::jsonb,
  potential_improvement_pct integer DEFAULT 0,
  priority_indicators text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.diagnostic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own diagnostic" ON public.diagnostic_results
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Admins can manage diagnostic" ON public.diagnostic_results
  FOR ALL TO authenticated
  USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));
