/**
 * AI pricing constants (Ola 20).
 *
 * Precios en USD por millón de tokens. Actualizados al 2026-04-29 según
 * pricing oficial de OpenAI, Perplexity, y Anthropic.
 *
 * IMPORTANTE: si los precios cambian, los logs históricos NO se recalculan.
 * El cost_usd que se guarda en api_usage_logs es un snapshot del momento.
 */

export interface ModelPricing {
  /** USD por 1M tokens de input. */
  input: number;
  /** USD por 1M tokens de input cacheado (cuando aplica, ej. OpenAI). */
  inputCached?: number;
  /** USD por 1M tokens de output. */
  output: number;
  /** Descripción human-friendly del modelo y para qué lo usamos. */
  description: string;
  /** Para qué lo usamos en el sistema. */
  useCase: string;
}

export const PRICING: Record<string, ModelPricing> = {
  // ── OpenAI ──────────────────────────────────────────────────
  'gpt-4o': {
    input: 2.50,
    inputCached: 1.25,  // 50% off para prefijo cacheado
    output: 10.00,
    description: 'Modelo principal de OpenAI. Razonamiento avanzado.',
    useCase: 'Copilot — análisis y respuestas a preguntas del negocio.',
  },
  'gpt-4o-mini': {
    input: 0.15,
    inputCached: 0.075,
    output: 0.60,
    description: 'Versión liviana y barata de gpt-4o.',
    useCase: 'No usado actualmente — disponible si se quiere para queries simples.',
  },

  // ── Perplexity ──────────────────────────────────────────────
  'sonar': {
    input: 1.00,
    output: 1.00,
    description: 'Búsqueda web con respuestas fundamentadas en fuentes reales.',
    useCase: 'Contexto de mercado / industria del negocio del cliente.',
  },
  'sonar-pro': {
    input: 3.00,
    output: 15.00,
    description: 'Versión premium de Perplexity con razonamiento más profundo.',
    useCase: 'Búsquedas macroeconómicas, proyecciones, contexto Argentina.',
  },

  // ── Anthropic ───────────────────────────────────────────────
  'claude-sonnet-4-5': {
    input: 3.00,
    inputCached: 0.30,
    output: 15.00,
    description: 'Modelo principal de Anthropic. Excelente con datos estructurados.',
    useCase: 'Procesamiento de archivos: clasificación, extracción y resumen.',
  },
};

/** Calcula el costo en USD de una llamada según sus tokens. */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  inputTokensCached: number = 0,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cachedCost = p.inputCached ? (inputTokensCached / 1_000_000) * p.inputCached : 0;
  const uncachedInput = Math.max(0, inputTokens - inputTokensCached);
  const inputCost = (uncachedInput / 1_000_000) * p.input;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return cachedCost + inputCost + outputCost;
}

/** Lista human-readable de features que loggeamos. */
export const FEATURE_LABELS: Record<string, string> = {
  copilot: 'Copilot — chat con IA',
  market_context: 'Contexto de mercado (Perplexity)',
  file_extraction: 'Extracción de datos de archivo',
  file_classification: 'Clasificación de categoría de archivo',
  file_summary: 'Resumen de archivo',
  category_detection: 'Detección de categoría con IA',
  other: 'Otro',
};

export const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  perplexity: 'Perplexity',
  anthropic: 'Anthropic (Claude)',
};

/** Estimaciones referenciales de uso típico para que el cliente entienda escalas. */
export interface UsageProfile {
  label: string;
  description: string;
  filesPerMonth: number;
  copilotQueriesPerMonth: number;
  estimatedMonthlyCost: { min: number; max: number };
}

export const USAGE_PROFILES: UsageProfile[] = [
  {
    label: 'PYME chica',
    description: 'Negocio de hasta 5 personas, ~100 ventas/mes, marketing básico.',
    filesPerMonth: 8,
    copilotQueriesPerMonth: 30,
    estimatedMonthlyCost: { min: 5, max: 15 },
  },
  {
    label: 'PYME mediana',
    description: 'Negocio de 5-20 personas, ~1000 ventas/mes, varias campañas activas.',
    filesPerMonth: 20,
    copilotQueriesPerMonth: 150,
    estimatedMonthlyCost: { min: 25, max: 60 },
  },
  {
    label: 'Empresa grande',
    description: 'Empresa con +20 empleados, miles de ventas/mes, equipo de marketing dedicado.',
    filesPerMonth: 80,
    copilotQueriesPerMonth: 800,
    estimatedMonthlyCost: { min: 150, max: 400 },
  },
  {
    label: 'Empresa muy grande',
    description: 'Múltiples sucursales/líneas de negocio, +50 usuarios consultando.',
    filesPerMonth: 300,
    copilotQueriesPerMonth: 3000,
    estimatedMonthlyCost: { min: 600, max: 1500 },
  },
];
