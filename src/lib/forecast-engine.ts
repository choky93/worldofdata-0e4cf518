// src/lib/forecast-engine.ts
// Forecast engine with weighted moving average + seasonal factors

import { findNumber, findString, findDateRaw, FIELD_AMOUNT, FIELD_DATE } from '@/lib/field-utils';
import { parseDate } from '@/lib/data-cleaning';

interface MonthBucket {
  total: number;
  date: Date;
}

export interface HistoryPoint {
  month: string;
  value: number;
  date: Date;
}

export interface ForecastPoint {
  month: string;
  real?: number;
  forecast?: number;
  forecastUpper?: number;
  forecastLower?: number;
}

export interface Projections {
  currentEstimate: number;
  nextMonth: number;
  quarterly: number;
  trend: number;
  usesSeasonality: boolean;
}

export interface ForecastResult {
  chartData: ForecastPoint[];
  projections: Projections | null;
  usesSeasonality: boolean;
}

/**
 * Aggregate raw sales rows into monthly totals sorted chronologically.
 */
export function aggregateSalesByMonth(
  ventas: any[],
  mappedDate?: string,
  mappedAmount?: string,
): HistoryPoint[] {
  const buckets = new Map<string, MonthBucket>();

  for (const r of ventas) {
    const raw = findDateRaw(r, mappedDate);
    if (!raw) continue;
    const d = parseDate(raw);
    if (!d) continue;

    const key = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    const amount = findNumber(r, FIELD_AMOUNT, mappedAmount);
    const existing = buckets.get(key);
    if (existing) {
      existing.total += amount;
    } else {
      buckets.set(key, { total: amount, date: new Date(d.getFullYear(), d.getMonth(), 1) });
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
    .map(([month, { total, date }]) => ({ month, value: total, date }));
}

/**
 * Calculate seasonal factors: average value per calendar month divided by grand average.
 * Returns a Map<monthIndex (0-11), factor>.
 */
function computeSeasonalFactors(history: HistoryPoint[]): Map<number, number> {
  const monthTotals = new Map<number, number[]>();

  for (const h of history) {
    const m = h.date.getMonth();
    const arr = monthTotals.get(m) || [];
    arr.push(h.value);
    monthTotals.set(m, arr);
  }

  const grandAvg = history.reduce((s, h) => s + h.value, 0) / history.length;
  if (grandAvg === 0) return new Map();

  const factors = new Map<number, number>();
  for (const [m, vals] of monthTotals) {
    const monthAvg = vals.reduce((s, v) => s + v, 0) / vals.length;
    factors.set(m, monthAvg / grandAvg);
  }

  return factors;
}

/**
 * Calculate the weighted moving average of the last N months.
 * More recent months get higher weight.
 */
function weightedMovingAverage(history: HistoryPoint[], windowSize: number): number {
  const slice = history.slice(-windowSize);
  if (slice.length === 0) return 0;

  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < slice.length; i++) {
    const weight = i + 1; // 1, 2, 3, ... (more recent = heavier)
    valueSum += slice[i].value * weight;
    weightSum += weight;
  }

  return valueSum / weightSum;
}

const CONFIDENCE_BAND = 0.15;

/**
 * Build forecast: trend (WMA-6) + seasonality if 13+ months of data.
 */
export function buildForecast(history: HistoryPoint[]): ForecastResult {
  if (history.length < 2) {
    return {
      chartData: history.map(d => ({ month: d.month, real: d.value })),
      projections: null,
      usesSeasonality: false,
    };
  }

  const usesSeasonality = history.length >= 13;
  const seasonalFactors = usesSeasonality ? computeSeasonalFactors(history) : null;
  const trendBase = weightedMovingAverage(history, Math.min(6, history.length));

  // Overall trend % (last vs previous for display)
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const trendPct = prev.value > 0 ? (last.value - prev.value) / prev.value : 0;

  const forecastPoints: { month: string; value: number; date: Date }[] = [];

  for (let offset = 1; offset <= 3; offset++) {
    const forecastDate = new Date(last.date);
    forecastDate.setMonth(forecastDate.getMonth() + offset);

    const month = forecastDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    const seasonFactor = seasonalFactors?.get(forecastDate.getMonth()) ?? 1;
    const value = Math.round(trendBase * seasonFactor);

    forecastPoints.push({ month, value, date: forecastDate });
  }

  // Build chart data: real history + forecast with confidence bands
  const chartData: ForecastPoint[] = history.map(d => ({
    month: d.month,
    real: d.value,
  }));

  // Bridge: last real point also starts the forecast line
  if (chartData.length > 0) {
    chartData[chartData.length - 1].forecast = last.value;
    chartData[chartData.length - 1].forecastUpper = last.value;
    chartData[chartData.length - 1].forecastLower = last.value;
  }

  for (const fp of forecastPoints) {
    chartData.push({
      month: fp.month,
      forecast: fp.value,
      forecastUpper: Math.round(fp.value * (1 + CONFIDENCE_BAND)),
      forecastLower: Math.round(fp.value * (1 - CONFIDENCE_BAND)),
    });
  }

  return {
    chartData,
    projections: {
      currentEstimate: forecastPoints[0]?.value || 0,
      nextMonth: forecastPoints[1]?.value || 0,
      quarterly: forecastPoints.reduce((s, p) => s + p.value, 0),
      trend: trendPct,
      usesSeasonality,
    },
    usesSeasonality,
  };
}
