-- Ola 20: Panel de Uso de IA — tracking de consumo de APIs externas
--
-- Lucas pidió un panel donde se vea exactamente en qué se está gastando:
-- qué modelo, qué feature, cuántos tokens, cuánto USD. Esto sirve para
-- justificar el costo y para que entienda que una empresa grande consume
-- distinto que una PYME.
--
-- Cada llamada a OpenAI / Perplexity / Claude se loggea acá con los
-- tokens consumidos y un cost_usd estimado al momento.

CREATE TABLE public.api_usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Qué proveedor: 'openai' | 'perplexity' | 'anthropic'
  provider text NOT NULL,
  -- Qué modelo concreto: 'gpt-4o' | 'sonar' | 'sonar-pro' | 'claude-sonnet-4-5' | etc.
  model text NOT NULL,
  -- Para qué se usó: 'copilot' | 'market_context' | 'file_extraction' |
  -- 'file_classification' | 'file_summary' | 'category_detection' | 'other'
  feature text NOT NULL,

  -- Tokens consumidos
  input_tokens integer NOT NULL DEFAULT 0,
  -- input_tokens_cached: parte del input que fue servida desde cache (50% off).
  -- Solo OpenAI lo reporta hoy. NULL si no se sabe.
  input_tokens_cached integer,
  output_tokens integer NOT NULL DEFAULT 0,

  -- Costo estimado en USD calculado al momento del log con los precios
  -- conocidos en lib/ai-pricing.ts. Si los precios cambian, los logs
  -- viejos no se recalculan (es un snapshot del costo de ese día).
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,

  -- Metadata adicional (opcional): file_upload_id, request_id, etc.
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_company_date ON public.api_usage_logs(company_id, created_at DESC);
CREATE INDEX idx_api_usage_company_provider ON public.api_usage_logs(company_id, provider);
CREATE INDEX idx_api_usage_company_feature ON public.api_usage_logs(company_id, feature);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario de la company puede VER el consumo (Lucas dijo:
-- "ahora dejalo libre para todos, después separamos por rol").
CREATE POLICY "Users see own company usage logs"
  ON public.api_usage_logs FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

-- INSERT solo lo hacen las edge functions (con service role). Los usuarios
-- normales no necesitan insertar — pero permitimos por las dudas con
-- check estricto.
CREATE POLICY "Users can insert own company usage logs"
  ON public.api_usage_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

-- DELETE bloqueado para usuarios normales — el historial es valioso
-- para auditoría. Solo admin puede limpiar (no incluido en la primera versión).
