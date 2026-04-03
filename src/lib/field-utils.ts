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
export function findNumber(row: Record<string, unknown>, keywords: string[], mappedCol?: string | null): number {
  // Priority 1: use AI-mapped column name directly
  if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null && row[mappedCol] !== '') {
    const v = row[mappedCol];
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    return parseNumericValue(String(v));
  }
  const val = findField(row, keywords);
  if (val === null || val === undefined) return 0;
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
export function findString(row: Record<string, unknown>, keywords: string[], mappedCol?: string | null): string {
  if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null) {
    return String(row[mappedCol]).trim();
  }
  const val = findField(row, keywords);
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ─── Column Mapping types ─────────────────────────────────────
export interface ColumnMapping {
  [semanticKey: string]: string | null;
}

// ─── Pre-built keyword sets for common business data ─────────

export const FIELD_NAME = ['nombre', 'name', 'descripcion', 'producto', 'detalle', 'concepto', 'item', 'articulo'];
export const FIELD_AMOUNT = ['monto', 'total', 'amount', 'valor', 'importe', 'ganancia', 'monto_total', 'monto_venta', 'total_mensual', 'precio', 'subtotal', 'neto'];
export const FIELD_DATE = ['fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day'];
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
