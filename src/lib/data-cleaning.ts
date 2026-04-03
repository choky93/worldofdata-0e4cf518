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
 * Try to parse a date string (ISO, dd/mm/yyyy, or various formats) into a Date.
 */
export function parseDate(raw: string): Date | null {
  if (!raw || raw === '—' || raw === '-') return null;
  
  // ISO format: 2023-11-01
  const d = new Date(raw);
  if (!isNaN(d.getTime()) && raw.includes('-')) return d;
  
  // dd/mm/yyyy
  const ddmmyyyy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const dt = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(dt.getTime())) return dt;
  }
  
  // yyyy-mm-dd already handled above, but try again
  const yyyymmdd = raw.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (yyyymmdd) {
    const dt = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    if (!isNaN(dt.getTime())) return dt;
  }
  
  // Serial number as string
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 1 && num < 200000) {
    return new Date((num - 25569) * 86400000);
  }
  
  return null;
}

/**
 * Filter rows by date period.
 */
export type PeriodKey = 'all' | 'this_month' | 'last_month' | 'last_3_months';

export function filterByPeriod(
  rows: any[],
  dateKeywords: string[],
  period: PeriodKey,
  findStringFn: (row: any, keywords: string[]) => string
): any[] {
  if (period === 'all') return rows;
  
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  let from: Date, to: Date;
  if (period === 'this_month') { from = thisMonth; to = nextMonth; }
  else if (period === 'last_month') { from = lastMonth; to = thisMonth; }
  else { from = threeMonthsAgo; to = nextMonth; }
  
  return rows.filter(row => {
    const raw = findStringFn(row, dateKeywords);
    const d = parseDate(raw);
    if (!d) return false;
    return d >= from && d < to;
  });
}
