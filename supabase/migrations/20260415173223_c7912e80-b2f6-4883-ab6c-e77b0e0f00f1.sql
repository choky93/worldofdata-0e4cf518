CREATE TABLE public.copilot_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own company conversation"
  ON public.copilot_conversations
  FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());