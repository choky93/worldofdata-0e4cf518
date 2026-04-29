/**
 * Data cleaning utilities: serial date conversion, summary row filtering.
 * Used both at ingestion time (CargaDatos) and at display time (modules).
 */

const DATE_KEYWORDS = ['fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day'];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function isDateColumn(header: string): boolean {
  if (header === '__EMPTY') return true;
  const nh = normalize(header);
  return DATE_KEYWORDS.some(kw => nh.includes(kw));
}

/**
 * Convert Excel serial date number to ISO date string.
 * Excel serial: days since 1900-01-01 (with the Lotus 1-2-3 bug).
 */
export function excelSerialToDate(serial: number): string {
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split('T')[0];
}

/**
 * Convert Excel serial dates in rows to ISO date strings.
 * Mutates rows in place for performance.
 */
export function convertSerialDates(rows: Record<string, unknown>[], headers: string[]): void {
  const dateHeaders = headers.filter(isDateColumn);
  if (dateHeaders.length === 0) return;

  for (const row of rows) {
    for (const h of dateHeaders) {
      const val = row[h];
      if (typeof val === 'number' && val > 1 && val < 200000) {
        row[h] = excelSerialToDate(val);
      } else if (typeof val === 'string') {
        const num = parseFloat(val);
        if (!isNaN(num) && num > 25569 && num < 200000 && /^\d+(\.\d+)?$/.test(val.trim())) {
          row[h] = excelSerialToDate(num);
        }
      }
    }
  }
}

const NAME_KEYWORDS = ['nombre', 'name', 'producto', 'product', 'campana', 'campaña',
  'campaign', 'detalle', 'concepto', 'descripcion', 'articulo', 'item', 'cliente', 'client'];

function isNameColumn(header: string): boolean {
  const nh = normalize(header);
  return NAME_KEYWORDS.some(kw => nh.includes(kw));
}

/**
 * Filter out summary/total rows.
 * A summary row has ALL name/descriptor columns empty but at least one numeric value > 0.
 */
export function filterSummaryRows(rows: Record<string, unknown>[], headers: string[]): Record<string, unknown>[] {
  const nameHeaders = headers.filter(isNameColumn);
  if (nameHeaders.length === 0) return rows; // Can't detect without name columns

  return rows.filter(row => {
    const allNamesEmpty = nameHeaders.every(h => {
      const v = row[h];
      return v === undefined || v === null || String(v).trim() === '';
    });

    if (!allNamesEmpty) return true; // Has a name → keep

    // Check if it has numeric values (likely a total row)
    const hasNumeric = Object.values(row).some(v => {
      if (typeof v === 'number' && v > 0) return true;
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[.,\s$]/g, ''));
        return !isNaN(n) && n > 0;
      }
      return false;
    });

    if (hasNumeric) {
      console.log('[data-cleaning] Filtered summary row:', JSON.stringify(row).substring(0, 200));
      return false;
    }
    return true;
  });
}

/**
 * Apply all cleaning steps to parsed rows before sending to backend.
 */
export function cleanParsedRows(rows: Record<string, unknown>[], headers: string[]): Record<string, unknown>[] {
  convertSerialDates(rows, headers);
  return filterSummaryRows(rows, headers);
}

/**
 * Same as cleanParsedRows but returns filter statistics so the caller can
 * surface a warning when an unusually high fraction of rows is filtered out
 * (likely a misread file: wrong delimiter, exotic header layout, etc.).
 */
export function cleanParsedRowsWithStats(
  rows: Record<string, unknown>[],
  headers: string[]
): { rows: Record<string, unknown>[]; originalCount: number; filteredCount: number; filterRate: number } {
  const originalCount = rows.length;
  const cleaned = cleanParsedRows(rows, headers);
  const filteredCount = originalCount - cleaned.length;
  const filterRate = originalCount > 0 ? filteredCount / originalCount : 0;
  return { rows: cleaned, originalCount, filteredCount, filterRate };
}

/**
 * Try to parse a date string (ISO, dd/mm/yyyy, Spanish months, quarters, etc.) into a Date.
 */
const SPANISH_MONTHS: Record<string, number> = {
  'enero': 0, 'ene': 0, 'febrero': 1, 'feb': 1, 'marzo': 2, 'mar': 2,
  'abril': 3, 'abr': 3, 'mayo': 4, 'may': 4, 'junio': 5, 'jun': 5,
  'julio': 6, 'jul': 6, 'agosto': 7, 'ago': 7, 'septiembre': 8, 'sep': 8, 'sept': 8,
  'octubre': 9, 'oct': 9, 'noviembre': 10, 'nov': 10, 'diciembre': 11, 'dic': 11,
};

export function parseDate(raw: string): Date | null {
  if (!raw || raw === '—' || raw === '-') return null;
  const trimmed = raw.trim();

  // Parsear fecha ISO como hora local para evitar bug de timezone (Argentina UTC-3)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
    if (!isNaN(d.getTime())) return d;
  }
  
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const dt = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(dt.getTime())) return dt;
  }
  
  // yyyy-mm-dd already handled above, but try again
  const yyyymmdd = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (yyyymmdd) {
    const dt = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    if (!isNaN(dt.getTime())) return dt;
  }

  // ISO year-month: "2024-12", "2024-01" — very common in Argentine management systems
  const isoYearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoYearMonth) {
    const yr = parseInt(isoYearMonth[1]);
    const mo = parseInt(isoYearMonth[2]) - 1;
    if (mo >= 0 && mo <= 11) return new Date(yr, mo, 1);
  }

  // Month/year with 4-digit year: "01/2024", "1/2024", "01-2024"
  const monthYear4d = trimmed.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (monthYear4d) {
    const mo = parseInt(monthYear4d[1]) - 1;
    const yr = parseInt(monthYear4d[2]);
    if (mo >= 0 && mo <= 11) return new Date(yr, mo, 1);
  }

  // Month/year with 2-digit year: "1/24", "12/24", "01-24"
  const monthYear2d = trimmed.match(/^(\d{1,2})[/\-](\d{2})$/);
  if (monthYear2d) {
    const mo = parseInt(monthYear2d[1]) - 1;
    const yr = 2000 + parseInt(monthYear2d[2]);
    if (mo >= 0 && mo <= 11 && yr >= 2000 && yr <= 2099) return new Date(yr, mo, 1);
  }

  // English abbreviated month-year: "Jan-24", "Dec-2024", "Mar 2024"
  // Common in systems that export in English even for Argentine companies
  const ENGLISH_MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const engMonthYear = trimmed.match(/^([a-zA-Z]{3})[-\s](\d{2,4})$/);
  if (engMonthYear) {
    const m = ENGLISH_MONTHS[engMonthYear[1].toLowerCase()];
    if (m !== undefined) {
      let yr = parseInt(engMonthYear[2]);
      if (yr < 100) yr += 2000;
      return new Date(yr, m, 1);
    }
  }

  // Spanish month names: "Enero 2024", "Ene 2024", "Ene-24", "Enero-2024", "ene. 2024"
  const lower = trimmed.toLowerCase().replace(/\./g, '').trim();
  const monthYear = lower.match(/^([a-záéíóú]+)\s*[-/]?\s*(\d{2,4})$/);
  if (monthYear) {
    const monthIdx = SPANISH_MONTHS[monthYear[1]];
    if (monthIdx !== undefined) {
      let year = parseInt(monthYear[2]);
      if (year < 100) year += 2000;
      return new Date(year, monthIdx, 1);
    }
  }

  // Quarters: "Q1 2024", "1T 2024", "1er Trim 2024", "T1 2024"
  const quarter = lower.match(/(?:q|t|(\d)(?:er|do|to)?\s*trim(?:estre)?)\s*(\d)?\s*(\d{4})/);
  if (quarter) {
    const qNum = parseInt(quarter[1] || quarter[2] || '1');
    const year = parseInt(quarter[3]);
    if (qNum >= 1 && qNum <= 4) return new Date(year, (qNum - 1) * 3, 1);
  }
  // Also "1T2024" or "Q12024"
  const quarterCompact = lower.match(/^(?:q|t)(\d)\s*(\d{4})$/);
  if (quarterCompact) {
    const qNum = parseInt(quarterCompact[1]);
    const year = parseInt(quarterCompact[2]);
    if (qNum >= 1 && qNum <= 4) return new Date(year, (qNum - 1) * 3, 1);
  }

  // "Semana 12 2024" or "Sem 12 2024"
  const week = lower.match(/sem(?:ana)?\s*(\d{1,2})\s*(\d{4})/);
  if (week) {
    const weekNum = parseInt(week[1]);
    const year = parseInt(week[2]);
    const jan1 = new Date(year, 0, 1);
    const dayOffset = (weekNum - 1) * 7;
    return new Date(jan1.getTime() + dayOffset * 86400000);
  }
  
  // Serial number as string
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 1 && num < 200000) {
    return new Date((num - 25569) * 86400000);
  }
  
  return null;
}

/**
 * Filter rows by date period.
 *
 * Formats supported (Ola 11 — selector global de período):
 *   'all'                              → todo el historial
 *   'this_month' | 'last_month' | 'last_3_months'  (legacy presets)
 *   'last_N_days' (e.g. 'last_7_days', 'last_30_days', 'last_90_days', 'last_365_days')
 *   'YYYY'                             → año
 *   'YYYY-Q1' .. 'YYYY-Q4'             → trimestre
 *   'YYYY-MM'                          → mes
 *   'custom:YYYY-MM-DD:YYYY-MM-DD'     → rango libre [from, to] inclusivo
 */
export type PeriodKey = 'all' | 'this_month' | 'last_month' | 'last_3_months' | string;

export function filterByPeriod(
  rows: any[],
  dateKeywords: string[],
  period: PeriodKey,
  findStringFn: (row: any, keywords: string[]) => string
): any[] {
  if (period === 'all') return rows;

  let from: Date, to: Date;

  // Custom range: "custom:YYYY-MM-DD:YYYY-MM-DD" (Ola 11)
  const customMatch = period.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (customMatch) {
    const [, fromStr, toStr] = customMatch;
    from = new Date(fromStr + 'T00:00:00');
    // 'to' es inclusivo: sumamos 1 día al límite superior
    const toDate = new Date(toStr + 'T00:00:00');
    to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
  }
  // Last N days: "last_7_days", "last_30_days", etc. (Ola 11)
  else if (/^last_(\d+)_days$/.test(period)) {
    const m = period.match(/^last_(\d+)_days$/)!;
    const n = parseInt(m[1], 10);
    const now = new Date();
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n + 1);
  }
  // Absolute month: "2023-11"
  else if (/^(\d{4})-(\d{2})$/.test(period)) {
    const monthMatch = period.match(/^(\d{4})-(\d{2})$/)!;
    const y = parseInt(monthMatch[1]);
    const m = parseInt(monthMatch[2]) - 1;
    from = new Date(y, m, 1);
    to = new Date(y, m + 1, 1);
  }
  // Absolute quarter: "2023-Q1"
  else if (/^\d{4}-Q[1-4]$/.test(period)) {
    const y = parseInt(period.slice(0, 4));
    const q = parseInt(period.slice(6)) - 1;
    from = new Date(y, q * 3, 1);
    to = new Date(y, q * 3 + 3, 1);
  }
  // Absolute year: "2023"
  else if (/^\d{4}$/.test(period)) {
    const y = parseInt(period);
    from = new Date(y, 0, 1);
    to = new Date(y + 1, 0, 1);
  }
  // Relative periods (legacy)
  else {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (period === 'this_month') { from = thisMonth; to = nextMonth; }
    else if (period === 'last_month') { from = lastMonth; to = thisMonth; }
    else { from = threeMonthsAgo; to = nextMonth; }
  }

  return rows.filter(row => {
    let raw = findStringFn(row, dateKeywords);
    if (!raw) {
      // Fallback robusto: buscar cualquier clave con valor ISO o Date
      for (const key of Object.keys(row)) {
        const val = (row as any)[key];
        if (val instanceof Date) { raw = val.toISOString(); break; }
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) { raw = val.trim(); break; }
      }
    }
    const d = parseDate(raw);
    if (!d) return false;
    return d >= from && d < to;
  });
}

/**
 * Extract unique months (YYYY-MM) from rows by scanning date columns.
 */
export function extractAvailableMonths(
  rows: any[],
  dateKeywords: string[],
  findStringFn: (row: any, keywords: string[]) => string
): string[] {
  const monthSet = new Set<string>();
  for (const row of rows) {
    let raw = findStringFn(row, dateKeywords);
    if (!raw) {
      // Fallback robusto: ISO string o Date en cualquier columna
      for (const key of Object.keys(row)) {
        const val = (row as any)[key];
        if (val instanceof Date) { raw = val.toISOString(); break; }
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) { raw = val.trim(); break; }
      }
    }
    if (!raw) continue;
    const d = parseDate(raw);
    if (!d) continue;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    monthSet.add(`${y}-${m}`);
  }
  return Array.from(monthSet).sort();
}

/**
 * Detect period overlap between rows grouped by file source.
 * Returns months (YYYY-MM) that appear in more than one file_upload_id.
 */
export function detectPeriodOverlap(
  existingRows: any[],
  newRows: any[],
  dateKeywords: string[],
  findStringFn: (row: any, kw: string[]) => string
): string[] {
  const extractMonths = (rows: any[]): Set<string> => {
    const months = new Set<string>();
    for (const row of rows) {
      const raw = findStringFn(row, dateKeywords);
      if (!raw) continue;
      const d = parseDate(raw);
      if (!d) continue;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.add(`${y}-${m}`);
    }
    return months;
  };

  const existingMonths = extractMonths(existingRows);
  const newMonths = extractMonths(newRows);

  const overlap: string[] = [];
  for (const m of newMonths) {
    if (existingMonths.has(m)) overlap.push(m);
  }
  return overlap.sort();
}

/**
 * Detect months that have data from more than one file_upload_id.
 * Takes rows tagged with __file_upload_id.
 */
/**
 * Detect if rows contain mixed currencies (ARS, USD, EUR).
 * Scans amount columns for currency symbols/prefixes.
 */
const CURRENCY_PATTERNS: { pattern: RegExp; currency: string }[] = [
  { pattern: /\bARS\b/i, currency: 'ARS' },
  { pattern: /\bUSD\b/i, currency: 'USD' },
  { pattern: /\bU\$S\b/i, currency: 'USD' },
  { pattern: /\bu\$s\b/i, currency: 'USD' },
  { pattern: /\bUS\$/i, currency: 'USD' },
  { pattern: /€/, currency: 'EUR' },
  { pattern: /\bEUR\b/i, currency: 'EUR' },
];

export function detectCurrencyMix(
  rows: any[],
  amountKeywords: string[],
  findStringFn?: (row: any, kw: string[]) => string
): boolean {
  return detectCurrencies(rows, amountKeywords, findStringFn).size > 1;
}

/**
 * Returns the set of currency codes found in amount columns.
 * Used by detectCurrencyMix and for richer UI warnings.
 */
export function detectCurrencies(
  rows: any[],
  amountKeywords: string[],
  findStringFn?: (row: any, kw: string[]) => string
): Set<string> {
  const currencies = new Set<string>();

  for (const row of rows) {
    const keys = Object.keys(row);
    const normalizedKw = amountKeywords.map(k => k.toLowerCase());

    for (const key of keys) {
      const nk = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const isAmountCol = normalizedKw.some(kw => nk.includes(kw));
      if (!isAmountCol) continue;

      const val = String(row[key] ?? '');
      for (const { pattern, currency } of CURRENCY_PATTERNS) {
        if (pattern.test(val)) currencies.add(currency);
      }
    }

    if (findStringFn) {
      const val = findStringFn(row, amountKeywords);
      if (val) {
        for (const { pattern, currency } of CURRENCY_PATTERNS) {
          if (pattern.test(val)) currencies.add(currency);
        }
      }
    }

    if (currencies.size > 1) return currencies; // early exit
  }

  return currencies;
}

export function detectMultiSourcePeriods(
  taggedRows: { row: any; fileUploadId: string }[],
  dateKeywords: string[],
  findStringFn: (row: any, kw: string[]) => string
): string[] {
  // month → set of file IDs
  const monthSources = new Map<string, Set<string>>();
  for (const { row, fileUploadId } of taggedRows) {
    const raw = findStringFn(row, dateKeywords);
    if (!raw) continue;
    const d = parseDate(raw);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthSources.has(key)) monthSources.set(key, new Set());
    monthSources.get(key)!.add(fileUploadId);
  }
  const duplicated: string[] = [];
  for (const [month, sources] of monthSources) {
    if (sources.size > 1) duplicated.push(month);
  }
  return duplicated.sort();
}


