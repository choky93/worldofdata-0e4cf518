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

  // Pass 3: partial match (key contains keyword OR keyword contains key, min 3 chars)
  for (const key of keys) {
    const nk = normalize(key);
    if (nk.length < 3) continue;
    for (const nkw of normalizedKeywords) {
      if (nkw.length < 3) continue;
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
export const FIELD_AMOUNT = ['monto', 'total', 'amount', 'valor', 'importe', 'ganancia', 'monto_total', 'monto_venta', 'total_mensual', 'precio', 'subtotal', 'neto'];
export const FIELD_DATE = \['__EMPTY', '__empty', 'unnamed:_0', 'fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day', 'fecha_venta', 'fecha_compra'\];
export const FIELD_CLIENT = ['cliente', 'client', 'razon_social', 'empresa', 'comprador', 'nombre_cliente'];
export const FIELD_CATEGORY = ['categoria', 'category', 'tipo', 'rubro', 'segmento', 'clase'];

// Marketing-specific
export const FIELD_CAMPAIGN_NAME = ['campana', 'campaña', 'nombre_campana', 'nombre_de_la_campana', 'campaign', 'nombre', 'name'];
export const FIELD_SPEND = ['gasto', 'inversion', 'spend', 'costo', 'importe', 'importe_gastado', 'importe_gastado_ars', 'presupuesto', 'budget', 'cost'];
export const FIELD_REVENUE = ['ingresos', 'revenue', 'ventas', 'retorno', 'ingreso', 'valor_conversion'];
export const FIELD_ROAS = ['roas', 'roas_de_resultados', 'retorno_inversion', 'roi'];
export const FIELD_CLICKS = ['clicks', 'clics', 'click', 'clic'];
export const FIELD_CTR = ['ctr', 'click_through_rate', 'tasa_clics'];
export const FIELD_CONVERSIONS = ['conversiones', 'conversions', 'resultados', 'resultado', 'ventas', 'leads', 'acciones'];
export const FIELD_REACH = ['alcance', 'reach', 'personas_alcanzadas'];
export const FIELD_IMPRESSIONS = ['impresiones', 'impressions', 'views', 'vistas', 'visualizaciones'];

// Stock-specific
export const FIELD_STOCK_QTY = ['stock', 'cantidad', 'unidades', 'qty', 'existencia', 'disponible'];
export const FIELD_STOCK_MIN = ['stock_minimo', 'min_stock', 'minimo', 'punto_reorden'];
export const FIELD_STOCK_MAX = ['stock_maximo', 'max_stock', 'maximo'];
export const FIELD_PRICE = ['precio', 'price', 'precio_venta', 'pv', 'precio_unitario'];
export const FIELD_COST = ['costo', 'cost', 'precio_costo', 'pc', 'costo_unitario'];

// Client-specific
export const FIELD_TOTAL_PURCHASES = ['total_compras', 'total', 'monto_total', 'ventas_totales', 'compras_totales', 'facturacion'];
export const FIELD_DEBT = ['deuda', 'saldo', 'pendiente', 'deuda_pendiente', 'cobro_pendiente', 'saldo_pendiente'];
export const FIELD_LAST_PURCHASE = ['ultima_compra', 'fecha_ultima', 'last_purchase', 'fecha', 'ultimo_pedido'];
export const FIELD_PURCHASE_COUNT = ['cantidad_compras', 'frecuencia', 'pedidos', 'cantidad_pedidos', 'compras', 'num_pedidos'];
