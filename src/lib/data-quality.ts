/**
 * Data Quality Score (5.2) + Anomaly Detection (5.3).
 *
 * Computed CLIENT-SIDE from the same extracted_json the dashboard uses.
 * No server changes required — score is a derived view, not stored.
 *
 * Score (0-100) is a weighted average of four dimensions:
 *   - completeness  (35%)  fraction of rows with the critical fields present
 *   - validity      (30%)  fraction of fields that parse as the expected type
 *   - uniqueness    (20%)  1 - (duplicate rows / total rows)
 *   - consistency   (15%)  fraction of rows whose date column parses correctly
 *
 * Anomalies are independent boolean flags:
 *   - outliers in numeric columns (>5σ from mean)
 *   - month-over-month change > 10x
 *   - date gaps inside the data range > 60 days
 */

import { findString, FIELD_AMOUNT, FIELD_DATE, FIELD_NAME } from './field-utils';
import { parseDate } from './data-cleaning';

export interface DataQualityScore {
  score: number;             // 0-100
  completeness: number;      // 0-1
  validity: number;          // 0-1
  uniqueness: number;        // 0-1
  consistency: number;       // 0-1
  rowCount: number;
  issues: string[];          // human-readable list of biggest problems
}

export interface AnomalyReport {
  outlierColumns: { column: string; count: number; max: number; mean: number }[];
  hasMomChange: boolean;
  momDetail?: { from: string; to: string; ratio: number };
  hasDateGap: boolean;
  gapDetail?: { start: string; end: string; days: number };
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // Accepts "$1.234,56" / "1,234.56" / "1234.56" — strip spaces/$, treat ,. by majority
  let s = v.replace(/[\s$%]/g, '');
  if (!s) return null;
  // Spanish format: dot=thousands, comma=decimal
  if (/,\d{1,2}$/.test(s) && /\./.test(s.slice(0, -3))) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/,/.test(s) && !/\./.test(s)) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function findRowKey(row: any, kw: string[], mapped?: string): unknown {
  return findString(row, kw, mapped);
}

export function computeDataQuality(
  rows: any[],
  category: string,
  mapping?: { date?: string; amount?: string; name?: string }
): DataQualityScore {
  const total = rows.length;
  if (total === 0) {
    return { score: 0, completeness: 0, validity: 0, uniqueness: 0, consistency: 0, rowCount: 0, issues: ['Sin filas'] };
  }

  const needsAmount = ['ventas', 'gastos', 'marketing', 'facturas'].includes(category);
  const needsDate = ['ventas', 'gastos', 'marketing', 'facturas'].includes(category);
  const needsName = ['ventas', 'gastos', 'stock', 'clientes', 'marketing'].includes(category);

  let completeRows = 0;
  let validAmountRows = 0;
  let validDateRows = 0;
  let amountChecked = 0;
  let dateChecked = 0;

  const issues: string[] = [];

  for (const row of rows) {
    let complete = true;

    if (needsName) {
      const name = findRowKey(row, FIELD_NAME, mapping?.name);
      if (!name || String(name).trim() === '') complete = false;
    }

    if (needsAmount) {
      amountChecked++;
      const amt = findRowKey(row, FIELD_AMOUNT, mapping?.amount);
      const num = parseNumber(amt);
      if (num !== null) validAmountRows++;
      else complete = false;
    }

    if (needsDate) {
      dateChecked++;
      const dt = findRowKey(row, FIELD_DATE, mapping?.date);
      if (dt && parseDate(String(dt))) validDateRows++;
      else complete = false;
    }

    if (complete) completeRows++;
  }

  const completeness = completeRows / total;
  const validity = (amountChecked + dateChecked) === 0
    ? 1
    : (validAmountRows + validDateRows) / (amountChecked + dateChecked);
  const consistency = dateChecked === 0 ? 1 : validDateRows / dateChecked;

  // Uniqueness via row hash (concat of stringified non-empty values)
  const hashes = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const h = Object.values(row).map(v => v === null || v === undefined ? '' : String(v)).join('|');
    if (hashes.has(h)) dupes++;
    else hashes.add(h);
  }
  const uniqueness = 1 - (dupes / total);

  if (completeness < 0.7) issues.push(`Sólo ${(completeness * 100).toFixed(0)}% de filas tienen todos los campos clave`);
  if (validity < 0.7) issues.push(`Sólo ${(validity * 100).toFixed(0)}% de los valores parseaban correctamente`);
  if (uniqueness < 0.95) issues.push(`${dupes} filas duplicadas detectadas`);
  if (consistency < 0.7 && needsDate) issues.push(`${(consistency * 100).toFixed(0)}% de fechas válidas`);

  const score = Math.round(
    100 * (completeness * 0.35 + validity * 0.30 + uniqueness * 0.20 + consistency * 0.15)
  );

  return { score, completeness, validity, uniqueness, consistency, rowCount: total, issues };
}

/** Mean and stddev of finite numbers. */
function stats(nums: number[]): { mean: number; std: number } {
  if (nums.length === 0) return { mean: 0, std: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return { mean, std: Math.sqrt(variance) };
}

export function detectAnomalies(
  rows: any[],
  category: string,
  mapping?: { date?: string; amount?: string }
): AnomalyReport {
  const report: AnomalyReport = {
    outlierColumns: [],
    hasMomChange: false,
    hasDateGap: false,
  };

  if (rows.length < 10) return report; // not enough data

  // Outlier scan: pick numeric columns
  const headers = Object.keys(rows[0] ?? {});
  for (const h of headers) {
    const nums: number[] = [];
    for (const r of rows) {
      const n = parseNumber(r[h]);
      if (n !== null) nums.push(n);
    }
    if (nums.length < 10) continue;
    const { mean, std } = stats(nums);
    if (std === 0) continue;
    let outliers = 0;
    let max = -Infinity;
    for (const n of nums) {
      if (Math.abs(n - mean) > 5 * std) {
        outliers++;
        if (n > max) max = n;
      }
    }
    if (outliers > 0) {
      report.outlierColumns.push({ column: h, count: outliers, max, mean });
    }
  }

  // Month-over-month change
  if (['ventas', 'gastos', 'marketing'].includes(category)) {
    const monthlyTotals: Record<string, number> = {};
    for (const r of rows) {
      const dt = findRowKey(r, FIELD_DATE, mapping?.date);
      const date = dt ? parseDate(String(dt)) : null;
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const amt = findRowKey(r, FIELD_AMOUNT, mapping?.amount);
      const n = parseNumber(amt);
      if (n === null) continue;
      monthlyTotals[key] = (monthlyTotals[key] || 0) + n;
    }
    const months = Object.keys(monthlyTotals).sort();
    for (let i = 1; i < months.length; i++) {
      const prev = monthlyTotals[months[i - 1]];
      const curr = monthlyTotals[months[i]];
      if (prev > 0 && curr > 0) {
        const ratio = curr / prev;
        if (ratio > 10 || ratio < 0.1) {
          report.hasMomChange = true;
          report.momDetail = { from: months[i - 1], to: months[i], ratio };
          break;
        }
      }
    }

    // Date gap check
    if (months.length >= 2) {
      const parsed = months.map(m => new Date(m + '-01').getTime()).sort((a, b) => a - b);
      for (let i = 1; i < parsed.length; i++) {
        const gapDays = (parsed[i] - parsed[i - 1]) / (1000 * 60 * 60 * 24);
        if (gapDays > 60) {
          report.hasDateGap = true;
          report.gapDetail = {
            start: months[i - 1],
            end: months[i],
            days: Math.round(gapDays),
          };
          break;
        }
      }
    }
  }

  return report;
}
