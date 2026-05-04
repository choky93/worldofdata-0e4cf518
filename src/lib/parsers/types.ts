/**
 * Wave B: deterministic parsers for known source systems.
 *
 * A parser inspects the file headers and decides:
 *   1. how confident it is that the file matches its system, and
 *   2. how the headers map to our semantic keys.
 *
 * If a parser returns confidence ≥ 0.8 we skip the AI classification call
 * entirely, saving cost and latency.
 */

import type { SourceSystem } from '@/lib/source-systems';

export interface ParserResult {
  /** Mapping semantic_key → exact original header. */
  mapping: Record<string, string>;
  /** 0..1 — the parser's confidence that its mapping is correct. */
  confidence: number;
  /** Soft warnings (e.g. "expected column X not found, used fallback Y"). */
  warnings: string[];
  /** AI-equivalent category this parser implies (ventas, marketing, ...). */
  category: string;
}

export interface SystemParser {
  systemId: SourceSystem;
  /** 0..1 — confidence that this parser handles the file based on headers. */
  match(headers: string[]): number;
  /** Build a mapping from the headers. */
  parse(headers: string[]): ParserResult;
}

/** Strip accents and non-alphanumerics, lowercase. */
export function normalizeHeader(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Find the first header that, when normalised, matches any of `candidates`. */
export function findHeader(
  headers: string[],
  candidates: string[],
): string | null {
  const norm = headers.map(h => ({ raw: h, n: normalizeHeader(h) }));
  const candNorms = candidates.map(normalizeHeader);
  // Exact normalised match first
  for (const c of candNorms) {
    const hit = norm.find(h => h.n === c);
    if (hit) return hit.raw;
  }
  // Prefix/contains as fallback
  for (const c of candNorms) {
    if (c.length < 5) continue;
    const hit = norm.find(h => h.n.includes(c) || c.includes(h.n));
    if (hit) return hit.raw;
  }
  return null;
}

/** Count how many of the expected normalised headers are present. */
export function countMatches(headers: string[], expected: string[]): number {
  const norm = headers.map(normalizeHeader);
  const expNorm = expected.map(normalizeHeader);
  let hits = 0;
  for (const e of expNorm) {
    if (norm.some(h => h === e || (e.length >= 5 && (h.includes(e) || e.includes(h))))) {
      hits++;
    }
  }
  return hits;
}
