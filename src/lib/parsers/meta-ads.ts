/**
 * Meta Ads (Facebook/Instagram Ads Manager) export parser.
 *
 * Typical Spanish-locale headers:
 *   "Nombre de la campaña", "Inicio del informe", "Fin del informe",
 *   "Importe gastado (ARS)", "Impresiones", "Alcance", "Clics (todos)",
 *   "CTR (todos)", "CPC (todos)", "Resultados", "Costo por resultado",
 *   "ROAS (retorno sobre el gasto publicitario) de la compra".
 *
 * English-locale variants are also handled.
 */

import type { SystemParser, ParserResult } from './types';
import { countMatches, findHeader } from './types';

const STRONG_SIGNALS = [
  'inicio_del_informe', 'fin_del_informe', 'reporting_starts', 'reporting_ends',
  'importe_gastado', 'amount_spent',
  'nombre_de_la_campana', 'campaign_name',
  'roas_de_resultados',
];

const SECONDARY_SIGNALS = [
  'impresiones', 'impressions', 'alcance', 'reach',
  'clics_todos', 'clicks_all', 'ctr_todos', 'ctr_all',
  'cpc_todos', 'cpc_all', 'resultados', 'results',
  'costo_por_resultado', 'cost_per_result',
];

export const metaAdsParser: SystemParser = {
  systemId: 'meta_ads',

  match(headers: string[]): number {
    const strong = countMatches(headers, STRONG_SIGNALS);
    const secondary = countMatches(headers, SECONDARY_SIGNALS);
    // Strong signals are very Meta-specific — two of them is near-certainty.
    if (strong >= 2) return Math.min(1, 0.85 + 0.05 * strong + 0.02 * secondary);
    if (strong === 1 && secondary >= 3) return 0.8;
    if (secondary >= 4) return 0.7;
    return 0;
  },

  parse(headers: string[]): ParserResult {
    const warnings: string[] = [];
    const mapping: Record<string, string> = {};

    const campaign = findHeader(headers, ['nombre de la campana', 'nombre_de_la_campana', 'campaign_name', 'campaign name', 'campana']);
    if (campaign) mapping.campaign_name = campaign; else warnings.push('No se encontró columna de nombre de campaña');

    const startDate = findHeader(headers, ['inicio del informe', 'inicio_del_informe', 'reporting starts', 'reporting_starts', 'fecha de inicio']);
    if (startDate) {
      mapping.start_date = startDate;
      mapping.date = startDate;
    }
    const endDate = findHeader(headers, ['fin del informe', 'fin_del_informe', 'reporting ends', 'reporting_ends', 'fecha de fin']);
    if (endDate) mapping.end_date = endDate;

    const spend = findHeader(headers, ['importe gastado (ars)', 'importe_gastado_ars', 'importe gastado', 'importe_gastado', 'amount spent', 'amount_spent', 'spend']);
    if (spend) mapping.spend = spend; else warnings.push('No se encontró columna de gasto');

    const impressions = findHeader(headers, ['impresiones', 'impressions']);
    if (impressions) mapping.impressions = impressions;

    const reach = findHeader(headers, ['alcance', 'reach']);
    if (reach) mapping.reach = reach;

    const clicks = findHeader(headers, ['clics (todos)', 'clics_todos', 'clicks (all)', 'clicks_all', 'clicks']);
    if (clicks) mapping.clicks = clicks;

    const ctr = findHeader(headers, ['ctr (todos)', 'ctr_todos', 'ctr (all)', 'ctr_all', 'ctr']);
    if (ctr) mapping.ctr = ctr;

    const conversions = findHeader(headers, ['resultados', 'results', 'conversiones', 'conversions']);
    if (conversions) mapping.conversions = conversions;

    const roas = findHeader(headers, ['roas (retorno sobre el gasto publicitario) de la compra', 'roas de resultados', 'roas_de_resultados', 'purchase roas', 'roas']);
    if (roas) mapping.roas = roas;

    // Confidence reflects how many critical fields we resolved.
    const critical = ['campaign_name', 'spend', 'date'];
    const got = critical.filter(k => mapping[k]).length;
    const confidence = got === 3 ? 0.95 : got === 2 ? 0.8 : 0.5;

    return { mapping, confidence, warnings, category: 'marketing' };
  },
};
