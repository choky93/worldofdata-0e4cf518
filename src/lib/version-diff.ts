/**
 * Version Diff (5.7).
 *
 * Computes a human-readable summary of how an incoming dataset differs from
 * the existing rows in the same overlapping period(s). Surfaces this in the
 * overlap dialog so the user can make an informed Replace vs. Keep-Both
 * decision instead of guessing.
 */

import { findString, FIELD_AMOUNT, FIELD_DATE, FIELD_NAME } from './field-utils';
import { parseDate } from './data-cleaning';

export interface MonthDiff {
  month: string;            // "2024-09"
  oldRowCount: number;
  newRowCount: number;
  oldTotal: number;         // sum of FIELD_AMOUNT
  newTotal: number;
  totalDeltaPct: number;    // (new-old)/old * 100
  newProductsAdded: number; // names in new not in old
  productsRemoved: number;  // names in old not in new
}

export interface VersionDiff {
  perMonth: MonthDiff[];
  totalOldRows: number;
  totalNewRows: number;
  totalOldAmount: number;
  totalNewAmount: number;
}

function parseNumberLoose(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[\s$%]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s) && /\./.test(s.slice(0, -3))) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/,/.test(s) && !/\./.test(s)) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function monthKeyOf(row: any, mapping?: { date?: string }): string | null {
  const raw = findString(row, FIELD_DATE, mapping?.date);
  if (!raw) return null;
  const d = parseDate(String(raw));
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nameOf(row: any, mapping?: { name?: string }): string | null {
  const raw = findString(row, FIELD_NAME, mapping?.name);
  if (!raw) return null;
  return String(raw).trim().toLowerCase();
}

function amountOf(row: any, mapping?: { amount?: string }): number {
  const raw = findString(row, FIELD_AMOUNT, mapping?.amount);
  return parseNumberLoose(raw) ?? 0;
}

export function computeVersionDiff(
  oldRows: any[],
  newRows: any[],
  overlappingMonths: string[],
  mapping?: { date?: string; amount?: string; name?: string }
): VersionDiff {
  const overlapSet = new Set(overlappingMonths);

  const oldByMonth: Record<string, { rows: any[]; total: number; names: Set<string> }> = {};
  const newByMonth: Record<string, { rows: any[]; total: number; names: Set<string> }> = {};

  let totalOldRows = 0, totalNewRows = 0, totalOldAmount = 0, totalNewAmount = 0;

  const indexInto = (
    bucket: Record<string, { rows: any[]; total: number; names: Set<string> }>,
    rows: any[],
    onAdd: (amt: number) => void
  ) => {
    for (const row of rows) {
      const mk = monthKeyOf(row, mapping);
      if (!mk || !overlapSet.has(mk)) continue;
      if (!bucket[mk]) bucket[mk] = { rows: [], total: 0, names: new Set() };
      const amt = amountOf(row, mapping);
      bucket[mk].rows.push(row);
      bucket[mk].total += amt;
      const nm = nameOf(row, mapping);
      if (nm) bucket[mk].names.add(nm);
      onAdd(amt);
    }
  };
  indexInto(oldByMonth, oldRows, (a) => { totalOldRows++; totalOldAmount += a; });
  indexInto(newByMonth, newRows, (a) => { totalNewRows++; totalNewAmount += a; });

  const perMonth: MonthDiff[] = overlappingMonths.map(month => {
    const o = oldByMonth[month] || { rows: [], total: 0, names: new Set<string>() };
    const n = newByMonth[month] || { rows: [], total: 0, names: new Set<string>() };
    const oldNames = o.names;
    const newNames = n.names;
    let added = 0, removed = 0;
    for (const nm of newNames) if (!oldNames.has(nm)) added++;
    for (const nm of oldNames) if (!newNames.has(nm)) removed++;
    const totalDeltaPct = o.total === 0 ? (n.total > 0 ? 100 : 0) : ((n.total - o.total) / o.total) * 100;
    return {
      month,
      oldRowCount: o.rows.length,
      newRowCount: n.rows.length,
      oldTotal: o.total,
      newTotal: n.total,
      totalDeltaPct,
      newProductsAdded: added,
      productsRemoved: removed,
    };
  });

  return { perMonth, totalOldRows, totalNewRows, totalOldAmount, totalNewAmount };
}
