/**
 * Data cleaning utilities: serial date conversion, summary row filtering.
 * Used both at ingestion time (CargaDatos) and at display time (modules).
 */

const DATE_KEYWORDS = ['fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day'];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function isDateColumn(header: string): boolean {
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

const NAME_KEYWORDS = ['nombre', 'name', 'producto', 'product', 'campana', 'campaign',
  'detalle', 'concepto', 'descripcion', 'articulo', 'item', 'cliente', 'client'];

function isNameColumn(header: string): boolean {
  const nh = normalize(header);
  return NAME_KEYWORDS.some(kw => nh.includes(kw));
}

/**
 * Filter out summary/total rows.
 */
export function filterSummaryRows(rows: Record<string, unknown>[], headers: string[]): Record<string, unknown>[] {
  const nameHeaders = headers.filter(isNameColumn);
  if (nameHeaders.length === 0) return rows;

  return rows.filter(row => {
    const allNamesEmpty = nameHeaders.every(h => {
      const v = row[h];
      return v === undefined || v === null || String(v).trim() === '';
    });

    if (!allNamesEmpty) return true;

    const hasNumeric = Object.values(row).some(v => {
      if (typeof v === 'number' && v > 0) return true;
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[.,\s$]/g, ''));
        return !isNaN(n) && n > 0;
      }
      return false;
    });

    return !hasNumeric;
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
 * Try to parse a date string into a Date.
 * FIXED: ISO dates parsed as local time to avoid UTC-3 timezone bug in Argentina.
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

  // ISO format: 2023-11-01 or 2023-11
  // CRITICAL: Parse as LOCAL time, not UTC, to avoid Argentina UTC-3 timezone bug
  const isoFull = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoFull) {
    const d = new Date(parseInt(isoFull[1]), parseInt(isoFull[2]) - 1, parseInt(isoFull[3]));
    if (!isNaN(d.getTime())) return d;
  }

  const isoMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) {
    const d = new Date(parseInt(isoMonth[1]), parseInt(isoMonth[2]) - 1, 1);
    if (!isNaN(d.getTime())) return d;
  }

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const dt = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(dt.getTime())) return dt;
  }

  // yyyy/mm/dd
  const yyyymmdd = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (yyyymmdd) {
    const dt = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    if (!isNaN(dt.getTime())) return dt;
  }

  // Spanish month names: "Enero 2024", "Ene 2024", "Ene-24"
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

  // Quarters: "Q1 2024", "T1 2024"
  const quarter = lower.match(/(?:q|t)(\d)\s*(\d{4})/);
  if (quarter) {
    const qNum = parseInt(quarter[1]);
    const year = parseInt(quarter[2]);
    if (qNum >= 1 && qNum <= 4) return new Date(year, (qNum - 1) * 3, 1);
  }

  // Serial number as string
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 1 && num < 200000) {
    return new Date((num - 25569) * 86400000);
  }

  return null;
}

/**
 * Helper: find date from row with fallback scanning all keys for ISO dates.
 * Handles files where the date column has no header (like __EMPTY).
 */
export function findDateRaw(row: any, findStringFn: (row: any, kw: string[]) => string, dateKeywords: string[]): string {
  const raw = findStringFn(row, dateKeywords);
  if (raw) return raw;

  // Fallback: scan all keys for ISO date values
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val;
    if (val instanceof Date) return val.toISOString().split('T')[0];
  }
  return '';
}

/**
 * Filter rows by date period.
 * Supports: 'all', relative ('this_month', 'last_month', 'last_3_months'),
 * and absolute ('2024', '2024-03', '2024-Q1')
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

  // Absolute month: "2024-03"
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1]);
    const m = parseInt(monthMatch[2]) - 1;
    from = new Date(y, m, 1);
    to = new Date(y, m + 1, 1);
  }
  // Absolute quarter: "2024-Q1"
  else if (/^\d{4}-Q[1-4]$/.test(period)) {
    const y = parseInt(period.slice(0, 4));
    const q = parseInt(period.slice(6)) - 1;
    from = new Date(y, q * 3, 1);
    to = new Date(y, q * 3 + 3, 1);
  }
  // Absolute year: "2024"
  else if (/^\d{4}$/.test(period)) {
    const y = parseInt(period);
    from = new Date(y, 0, 1);
    to = new Date(y + 1, 0, 1);
  }
  // Relative periods
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
    // Use findDateRaw for fallback support with __EMPTY columns
    let raw = findStringFn(row, dateKeywords);
    if (!raw) {
      // Fallback: scan all keys for ISO date values
      for (const key of Object.keys(row)) {
        const val = (row as any)[key];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) { raw = val; break; }
        if (val instanceof Date) { raw = val.toISOString().split('T')[0]; break; }
      }
    }
    const d = parseDate(raw);
    if (!d) return false;
    return d >= from && d < to;
  });
}

/**
 * Extract unique months (YYYY-MM) from rows.
 */
export function extractAvailableMonths(
  rows: any[],
  dateKeywords: string[],
  findStringFn: (row: any, kw: string[]) => string
): string[] {
  const monthSet = new Set<string>();
  for (const row of rows) {
    let raw = findStringFn(row, dateKeywords);
    if (!raw) {
      for (const key of Object.keys(row)) {
        const val = (row as any)[key];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) { raw = val; break; }
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
 * Detect months that appear in data from more than one source file.
 */
export function detectMultiSourcePeriods(
  taggedRows: { row: any; fileUploadId: string }[],
  dateKeywords: string[],
  findStringFn: (row: any, kw: string[]) => string
): string[] {
  const monthToFiles = new Map<string, Set<string>>();
  for (const { row, fileUploadId } of taggedRows) {
    let raw = findStringFn(row, dateKeywords);
    if (!raw) {
      for (const key of Object.keys(row)) {
        const val = (row as any)[key];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) { raw = val; break; }
      }
    }
    if (!raw) continue;
    const d = parseDate(raw);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthToFiles.has(key)) monthToFiles.set(key, new Set());
    monthToFiles.get(key)!.add(fileUploadId);
  }
  return Array.from(monthToFiles.entries())
    .filter(([, files]) => files.size > 1)
    .map(([month]) => month)
    .sort();
}

/**
 * Detect period overlap between two sets of rows.
 */
export function detectPeriodOverlap(
  existingRows: any[],
  newRows: any[],
  dateKeywords: string[],
  findStringFn: (row: any, kw: string[]) => string
): string[] {
  const getMonths = (rows: any[]) => {
    const months = new Set<string>();
    for (const row of rows) {
      let raw = findStringFn(row, dateKeywords);
      if (!raw) {
        for (const key of Object.keys(row)) {
          const val = (row as any)[key];
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) { raw = val; break; }
        }
      }
      if (!raw) continue;
      const d = parseDate(raw);
      if (!d) continue;
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  const existingMonths = getMonths(existingRows);
  const newMonths = getMonths(newRows);
  return Array.from(newMonths).filter(m => existingMonths.has(m)).sort();
}

/**
 * Detect if rows contain mixed currencies.
 */
export function detectCurrencyMix(rows: any[], amountKeywords: string[]): boolean {
  const currencyPatterns = [
    /^\$/, /^ARS/i, /^USD/i, /^U\$S/i, /^US\$/i, /€/, /^EUR/i
  ];
  const foundCurrencies = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row)) {
      const val = String(row[key] || '');
      for (const pattern of currencyPatterns) {
        if (pattern.test(val)) {
          foundCurrencies.add(pattern.source);
          break;
        }
      }
    }
  }
  return foundCurrencies.size > 1;
}
