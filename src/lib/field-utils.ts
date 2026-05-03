/**
 * Smart field matching for extracted data.
 *
 * The AI returns column names in various formats (nombre_de_la_campana,
 * importe_gastado_ars, etc.). This utility searches ALL keys in a row
 * for the best match, not just exact names.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');      // strip non-alphanumeric
}

/**
 * Find the value in a row that best matches any of the given keywords.
 * Tries: exact match → normalized exact → partial contains.
 * Returns the raw value (string/number) or null if not found.
 */
export function findField(row: Record<string, unknown>, keywords: string[]): unknown {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  const normalizedKeywords = keywords.map(normalize);

  // Pass 1: exact key match
  for (const kw of keywords) {
    if (row[kw] !== undefined && row[kw] !== '' && row[kw] !== null) return row[kw];
  }

  // Pass 2: case-insensitive / accent-insensitive exact match
  for (const key of keys) {
    const nk = normalize(key);
    for (const nkw of normalizedKeywords) {
      if (nk === nkw && row[key] !== undefined && row[key] !== '' && row[key] !== null) {
        return row[key];
      }
    }
  }

  // Pass 2.5: prefix match for known short abbreviations (3–4 chars).
  // e.g. "vta" matches "vtamensual", "vtaneta"; "mto" matches "mtototal".
  // Uses startsWith to avoid "mes" matching inside "mensual" (false positive).
  for (const key of keys) {
    const nk = normalize(key);
    if (nk.length < 4) continue; // key must be longer than the abbreviation
    for (const nkw of normalizedKeywords) {
      if (nkw.length < 3 || nkw.length >= 5) continue; // only 3–4 char keywords
      if (nk.startsWith(nkw) && row[key] !== undefined && row[key] !== '' && row[key] !== null) {
        return row[key];
      }
    }
  }

  // Pass 3: partial match (key contains keyword OR keyword contains key).
  // Minimum 5 chars on both sides to avoid false positives:
  // e.g. 'venta' (5) would match 'Costo de Ventas' — raising the floor reduces noise
  // while still catching legitimate compound names like 'monto_total' ↔ 'total'.
  for (const key of keys) {
    const nk = normalize(key);
    if (nk.length < 5) continue;
    for (const nkw of normalizedKeywords) {
      if (nkw.length < 5) continue;
      if ((nk.includes(nkw) || nkw.includes(nk)) && row[key] !== undefined && row[key] !== '' && row[key] !== null) {
        return row[key];
      }
    }
  }

  return null;
}

/**
 * Find a numeric value from a row using keyword matching.
 * If mappedCol is provided, it takes priority over keywords.
 */
export function findNumber(row: Record<string, unknown>, keywords: string[], mappedCol?: string | null, allRows?: Record<string, unknown>[]): number {
  // Priority 1: use AI-mapped column name directly
  if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null && row[mappedCol] !== '') {
    const v = row[mappedCol];
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    return parseNumericValue(String(v));
  }
  const val = findField(row, keywords);
  if (val === null || val === undefined) {
    // Level 3: Contextual inference — find most likely numeric column
    if (allRows && allRows.length > 0) {
      const inferredCol = inferNumericColumn(row, allRows, keywords);
      if (inferredCol !== null) {
        const v = row[inferredCol];
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        if (v !== null && v !== undefined && v !== '') return parseNumericValue(String(v));
      }
    }
    return 0;
  }
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  return parseNumericValue(String(val));
}

function parseNumericValue(s: string): number {
  const cleaned0 = s.trim().replace(/^[$\s]+/, '').replace(/\s+/g, '');
  if (!cleaned0 || cleaned0 === '—' || cleaned0 === '-') return 0;
  const lastDot = cleaned0.lastIndexOf('.');
  const lastComma = cleaned0.lastIndexOf(',');
  let cleaned: string;
  if (lastComma > lastDot) {
    cleaned = cleaned0.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    cleaned = cleaned0.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    const parts = cleaned0.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned0.replace(',', '.');
    } else {
      cleaned = cleaned0.replace(/,/g, '');
    }
  } else {
    cleaned = cleaned0;
  }
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

/**
 * Find a string value from a row using keyword matching.
 * If mappedCol is provided, it takes priority over keywords.
 */
export function findString(row: Record<string, unknown>, keywords: string[], mappedCol?: string | null, allRows?: Record<string, unknown>[]): string {
  if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null) {
    return String(row[mappedCol]).trim();
  }
  const val = findField(row, keywords);
  if (val === null || val === undefined) {
    // Level 3: Contextual inference — find most likely text column
    if (allRows && allRows.length > 0) {
      const inferredCol = inferStringColumn(row, allRows, keywords);
      if (inferredCol !== null) {
        const v = row[inferredCol];
        if (v !== null && v !== undefined) return String(v).trim();
      }
    }
    return '';
  }
  return String(val).trim();
}

// ─── Level 3: Contextual Inference ───────────────────────────

const _inferCache = new Map<string, string | null>();

/**
 * Infer the most likely numeric column by analyzing data patterns.
 * Looks for columns with the highest density of large numeric values.
 */
function inferNumericColumn(
  row: Record<string, unknown>,
  allRows: Record<string, unknown>[],
  excludeKeywords: string[],
): string | null {
  const cacheKey = `num:${excludeKeywords.slice(0, 3).join(',')}:${Object.keys(row).join(',')}`;
  if (_inferCache.has(cacheKey)) return _inferCache.get(cacheKey)!;

  const keys = Object.keys(row);
  const normalizedExclude = excludeKeywords.map(normalize);
  let bestCol: string | null = null;
  let bestScore = 0;

  const sample = allRows.slice(0, 50);

  for (const key of keys) {
    const nk = normalize(key);
    // Skip columns already matched by keywords (already tried and failed)
    if (nk.length < 2) continue;
    // Skip date-like columns
    if (['fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day', 'id', 'codigo', 'code'].some(d => nk.includes(d))) continue;

    let numericCount = 0;
    let totalValue = 0;

    for (const r of sample) {
      const v = r[key];
      if (v === null || v === undefined || v === '') continue;
      let num: number;
      if (typeof v === 'number') {
        num = v;
      } else {
        const s = String(v).trim().replace(/^[$\s]+/, '');
        num = parseFloat(s.replace(/[.,]/g, (m, offset, str) => {
          // Simple: if it looks numeric after stripping formatting
          return m;
        }));
        // Try parseNumericValue for better accuracy
        num = parseNumericValue(s);
      }
      if (!isNaN(num) && num !== 0) {
        numericCount++;
        totalValue += Math.abs(num);
      }
    }

    // Score: density of numeric values × average magnitude
    if (numericCount > sample.length * 0.4) {
      const score = numericCount * (totalValue / Math.max(numericCount, 1));
      if (score > bestScore) {
        bestScore = score;
        bestCol = key;
      }
    }
  }

  _inferCache.set(cacheKey, bestCol);
  return bestCol;
}

/**
 * Infer the most likely text/name column by analyzing data patterns.
 * Looks for columns with the highest density of unique non-numeric text values.
 */
function inferStringColumn(
  row: Record<string, unknown>,
  allRows: Record<string, unknown>[],
  excludeKeywords: string[],
): string | null {
  const cacheKey = `str:${excludeKeywords.slice(0, 3).join(',')}:${Object.keys(row).join(',')}`;
  if (_inferCache.has(cacheKey)) return _inferCache.get(cacheKey)!;

  const keys = Object.keys(row);
  let bestCol: string | null = null;
  let bestScore = 0;

  const sample = allRows.slice(0, 50);

  for (const key of keys) {
    const nk = normalize(key);
    if (nk.length < 2) continue;
    // Skip date/id columns
    if (['fecha', 'date', 'periodo', 'mes', 'month', 'id', 'codigo', 'code', 'numero', 'number'].some(d => nk.includes(d))) continue;

    const uniqueValues = new Set<string>();
    let textCount = 0;

    for (const r of sample) {
      const v = r[key];
      if (v === null || v === undefined || v === '') continue;
      const s = String(v).trim();
      // Check it's not purely numeric
      if (s && isNaN(Number(s.replace(/[.,\s$%]/g, '')))) {
        textCount++;
        uniqueValues.add(s.toLowerCase());
      }
    }

    // Score: many unique text values = likely a name/description column
    if (textCount > sample.length * 0.4) {
      const score = uniqueValues.size * textCount;
      if (score > bestScore) {
        bestScore = score;
        bestCol = key;
      }
    }
  }

  _inferCache.set(cacheKey, bestCol);
  return bestCol;
}

// ─── Column Mapping types ─────────────────────────────────────
export interface ColumnMapping {
  [semanticKey: string]: string | null;
}

// ─── Pre-built keyword sets for common business data ─────────

export const FIELD_NAME = ['nombre', 'name', 'descripcion', 'producto', 'detalle', 'concepto', 'item', 'articulo'];
// FIELD_AMOUNT: keywords ordenados de más específico a más genérico para evitar falsos positivos.
// EXCLUIDOS intencionalmente:
//   'ganancia' → pertenece a FIELD_PROFIT (margen ≠ ingreso)
//   'precio'   → demasiado genérico; matchea 'precio_de_costo' por partial match
//   'venta'    → partial match peligroso: 'Costo de Venta' contiene 'venta'
export const FIELD_AMOUNT = [
  // Términos de monto/total — primera prioridad
  'monto', 'total', 'amount', 'importe', 'valor',
  // Variantes compuestas específicas
  'monto_total', 'monto_venta', 'total_mensual', 'total_venta',
  'subtotal', 'neto',
  // Abreviaciones comunes en exportaciones de sistemas argentinos (POS, gestión)
  // Nota: 'vta', 'mto', 'gto', 'pvp' son 3–4 chars → usan Pass 2.5 (prefix match)
  'vta', 'mto', 'gto', 'pvp',
  // Variantes de ingreso y recaudación
  'ingreso', 'recaudacion', 'recaudación',
  // Precio de venta como último recurso (cuando no hay columna de total)
  'precio_de_venta', 'precio de venta', 'precio_venta',
  // Ventas como columna de ingreso (e.g. archivo mensual con columna "Ventas")
  'ventas', 'valor_venta', 'ingresos', 'facturacion', 'facturación',
  // Ola 21: CRM (Salesforce, HubSpot, Pipedrive, Zoho, Dynamics)
  'deal_value', 'deal_amount', 'opportunity_value', 'opportunity_amount',
  'expected_revenue', 'annual_revenue', 'expected_amount',
  'pipeline_value', 'close_value', 'closed_amount', 'won_amount',
  'deal_size', 'estimated_value', 'forecast_amount',
  'arr', 'mrr', 'recurring_revenue', 'revenue',
];
// Claves semánticas normalizadas primero, luego aliases históricos para datos ya cargados.
export const FIELD_DATE = [
  'fecha', 'date', 'periodo', 'period', 'mes', 'month', 'dia', 'day',
  'fecha_operacion', 'fecha_venta', 'fecha_compra',
  // Ola 21: fechas típicas de CRM
  'close_date', 'closing_date', 'expected_close', 'expected_close_date',
  'created_date', 'create_date', 'created_at', 'createdate',
  'last_activity', 'last_activity_date', 'last_contact', 'last_modified',
  'next_activity_date', 'next_step_date', 'modified', 'updated_at',
  'fecha_cierre', 'fecha_creacion', 'fecha_ultima_actividad',
  // FIX feedback Lucas Tanda 8 (2026-05-03): exports de Meta Ads usan
  // "Inicio del informe" / "Fin del informe" / "Reporting starts" /
  // "Reporting ends" como columnas de fecha. Sin estos keywords, el
  // cálculo de DataQuality no encontraba fecha → consistency=0,
  // completeness baja, DQ ~35%. Ahora se detectan correctamente.
  'inicio_del_informe', 'fin_del_informe', 'inicio del informe', 'fin del informe',
  'reporting_starts', 'reporting_ends', 'reporting starts', 'reporting ends',
  'inicio', 'fin', 'desde', 'hasta', 'start_date', 'end_date',
  'fecha_inicio', 'fecha_fin',
  // Aliases históricos (datos ya cargados con headers genéricos)
  '__EMPTY', '__empty', 'unnamed:_0', 'unnamed_0', 'unnamed', 'col_0', 'column_0',
];

/**
 * Detección robusta de la fecha real de una fila.
 * Orden:
 *   1) campo mapeado explícito (mappedDate)
 *   2) claves semánticas normalizadas y aliases históricos (FIELD_DATE)
 *   3) fallback: cualquier valor con formato ISO (YYYY-MM-DD) o instancia Date
 */
export function findDateRaw(row: Record<string, unknown>, mappedDate?: string | null): string {
  if (!row || typeof row !== 'object') return '';

  if (mappedDate && row[mappedDate] !== undefined && row[mappedDate] !== null && row[mappedDate] !== '') {
    const v = row[mappedDate];
    if (v instanceof Date) return v.toISOString();
    return String(v).trim();
  }

  const raw = findString(row, FIELD_DATE, mappedDate ?? undefined);
  if (raw) return raw;

  for (const key of Object.keys(row)) {
    const val = (row as any)[key];
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) return val.trim();
  }
  return '';
}
export const FIELD_CLIENT = ['cliente', 'client', 'razon_social', 'empresa', 'comprador', 'nombre_cliente', 'account_name', 'account', 'company_name', 'customer_name', 'customer'];
export const FIELD_CATEGORY = ['categoria', 'category', 'tipo', 'rubro', 'segmento', 'clase'];

// Ola 21: CRM (oportunidades / pipeline / cuentas)
export const FIELD_DEAL_STAGE = [
  'stage', 'pipeline_stage', 'deal_stage', 'opportunity_stage',
  'etapa', 'estado', 'status', 'sales_stage', 'phase', 'fase',
];
export const FIELD_DEAL_NAME = [
  'deal_name', 'deal', 'opportunity_name', 'opportunity',
  'nombre_oportunidad', 'oportunidad', 'titulo_negocio',
];
export const FIELD_DEAL_OWNER = [
  'owner', 'deal_owner', 'opportunity_owner', 'sales_rep', 'vendedor',
  'asignado', 'asigned_to', 'assigned_to', 'responsable', 'rep',
];
export const FIELD_PROBABILITY = [
  'probability', 'probabilidad', 'win_probability', 'forecast_category',
  'likelihood', 'confidence',
];
export const FIELD_LEAD_SOURCE = [
  'lead_source', 'source', 'origen', 'fuente', 'channel', 'canal',
  'utm_source', 'referral_source',
];

// Marketing-specific
export const FIELD_CAMPAIGN_NAME = ['campana', 'campaña', 'nombre_campana', 'nombre_de_la_campana', 'campaign', 'nombre', 'name'];
// Sólo objetivo de campaña (qué busca lograr la campaña).
// IMPORTANTE: NO incluir 'tipo' (genérico, captura "tipo de presupuesto"=diario/vitalicio),
// ni 'buying_type'/'bid_strategy' (ésos son método de compra, no objetivo).
export const FIELD_OBJECTIVE = ['objetivo', 'objective', 'campaign_objective', 'tipo_campana', 'tipo_de_campana', 'campaign_type', 'campaign_objective_type', 'goal'];
export const FIELD_SPEND = ['gasto', 'inversion', 'spend', 'costo', 'importe', 'importe_gastado', 'importe_gastado_ars', 'presupuesto', 'budget', 'cost'];
export const FIELD_REVENUE = ['ingresos', 'revenue', 'ventas', 'retorno', 'ingreso', 'valor_conversion'];
export const FIELD_ROAS = ['roas', 'roas_de_resultados', 'retorno_inversion', 'roi'];
export const FIELD_CLICKS = ['clicks', 'clics', 'click', 'clic'];
export const FIELD_CTR = ['ctr', 'click_through_rate', 'tasa_clics'];
export const FIELD_CONVERSIONS = ['conversiones', 'conversions', 'resultados', 'resultado', 'leads', 'acciones', 'purchases', 'compras'];
export const FIELD_REACH = ['alcance', 'reach', 'personas_alcanzadas'];
export const FIELD_IMPRESSIONS = ['impresiones', 'impressions', 'views', 'vistas', 'visualizaciones'];

// Stock-specific
export const FIELD_STOCK_QTY = ['stock', 'cantidad', 'unidades', 'qty', 'existencia', 'disponible'];
// Sales-specific quantity (units sold per transaction/row)
export const FIELD_SALE_QTY = ['cantidad', 'unidades', 'qty', 'cant', 'cantidad_vendida', 'unidades_vendidas', 'units', 'cant_vendida', 'volumen'];
export const FIELD_STOCK_MIN = ['stock_minimo', 'min_stock', 'minimo', 'punto_reorden'];
export const FIELD_STOCK_MAX = ['stock_maximo', 'max_stock', 'maximo'];
export const FIELD_PRICE = ['precio', 'price', 'precio_venta', 'pv', 'precio_unitario'];
export const FIELD_COST = ['costo', 'cost', 'precio_costo', 'precio_de_costo', 'pc', 'costo_unitario', 'costo_total'];
export const FIELD_PROFIT = ['ganancia', 'profit', 'margen', 'utilidad', 'resultado'];
// Client-specific
export const FIELD_TOTAL_PURCHASES = ['total_compras', 'total', 'monto_total', 'ventas_totales', 'compras_totales', 'facturacion'];
export const FIELD_DEBT = ['deuda', 'saldo', 'pendiente', 'deuda_pendiente', 'cobro_pendiente', 'saldo_pendiente'];
export const FIELD_LAST_PURCHASE = ['ultima_compra', 'fecha_ultima', 'last_purchase', 'fecha', 'ultimo_pedido'];
export const FIELD_PURCHASE_COUNT = ['cantidad_compras', 'frecuencia', 'pedidos', 'cantidad_pedidos', 'compras', 'num_pedidos'];

// Date range fields (marketing campaigns, reporting periods)
export const FIELD_START_DATE = ['inicio', 'start', 'desde', 'fecha_inicio', 'inicio_informe', 'fecha_de_inicio', 'start_date', 'period_start', 'inicio_del_informe'];
export const FIELD_END_DATE = ['fin', 'end', 'hasta', 'fecha_fin', 'fin_informe', 'fecha_de_fin', 'end_date', 'period_end', 'fin_del_informe'];

// ─── Helpers semánticos reutilizables ─────────────────────────
export function getStockUnits(row: Record<string, unknown>, mappedCol?: string | null): number {
  return findNumber(row, FIELD_STOCK_QTY, mappedCol);
}
export function getCost(row: Record<string, unknown>, mappedCol?: string | null): number {
  return findNumber(row, FIELD_COST, mappedCol);
}
export function getPrice(row: Record<string, unknown>, mappedCol?: string | null): number {
  return findNumber(row, FIELD_PRICE, mappedCol);
}
export function getProductName(row: Record<string, unknown>, mappedCol?: string | null): string {
  return findString(row, FIELD_NAME, mappedCol);
}
export function getQuantity(row: Record<string, unknown>, mappedCol?: string | null): number {
  return findNumber(row, FIELD_SALE_QTY, mappedCol);
}

/**
 * Stock status helper.
 * coverageDays = stockUnits / monthlyUnitsSold * 30
 */
export type StockStatus = 'ok' | 'low' | 'critical' | 'overstock' | 'no-data';
export function getStockStatus(coverageDays: number, leadTimeDays: number = 20): StockStatus {
  if (!coverageDays || coverageDays <= 0) return 'no-data';
  if (coverageDays > leadTimeDays * 6) return 'overstock';
  if (coverageDays < leadTimeDays * 0.5) return 'critical';
  if (coverageDays < leadTimeDays) return 'low';
  return 'ok';
}

/**
 * Dedupe stock rows by product name.
 * Strategy: keep the row from the most recent file (uploaded_at / created_at / file_upload_id),
 * fallback to the row with the highest stock value when no timestamp/id is available.
 */
/**
 * Dedupe stock rows by product name.
 *
 * Relies on the fact that useExtractedData queries file_extracted_data
 * ORDER BY created_at DESC — so rows from the most recently uploaded file
 * arrive first. Strategy:
 *   1. If the incoming row has a parseable timestamp field (uploaded_at /
 *      created_at embedded in the business data), use that explicitly.
 *   2. Otherwise keep the first-seen row (= newest file by DB order).
 *
 * NOTE: "keep higher stock" was removed as a fallback — a product with more
 * units is NOT necessarily from a newer file (it could be stale inventory).
 */
export function dedupeStockRows<T extends Record<string, any>>(rows: T[], mappedNameCol?: string | null, mappedStockCol?: string | null): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const rowTimestamp = (r: any): number => {
    // Priority 1: __file_created_at injected by useExtractedData from the DB record timestamp
    // Priority 2: explicit date fields embedded in the business data row itself
    const ts = r?.__file_created_at ?? r?.uploaded_at ?? r?.created_at ?? r?.uploadedAt ?? r?.createdAt;
    if (ts) {
      const t = Date.parse(String(ts));
      if (!isNaN(t)) return t;
    }
    return NaN;
  };

  const map = new Map<string, T>();
  for (const r of rows) {
    const name = getProductName(r, mappedNameCol).trim().toLowerCase();
    const key = name || `__row_${Math.random()}`; // rows without name → keep all
    const existing = map.get(key);

    // First occurrence wins (rows arrive newest-first from DB query)
    if (!existing) { map.set(key, r); continue; }

    // Only replace if the incoming row has an explicit timestamp proving it's newer
    const tsNew = rowTimestamp(r);
    const tsOld = rowTimestamp(existing);
    if (!isNaN(tsNew) && (isNaN(tsOld) || tsNew > tsOld)) {
      map.set(key, r);
    }
    // In all other cases: keep existing (= already the most recent by DB order)
  }
  return Array.from(map.values());
}
