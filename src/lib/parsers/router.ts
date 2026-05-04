/**
 * Wave B router: pick the best deterministic parser for a file.
 *
 * Order of operations:
 *   1. If the user declared a `systemId` and we have a registered parser for
 *      it, run that parser first. If its confidence ≥ 0.7, use it.
 *   2. Otherwise (no hint, no registered parser, or low confidence) try ALL
 *      parsers and return the best match if its confidence ≥ 0.7.
 *   3. If nothing crosses the threshold, return null — caller falls back to
 *      the existing AI flow.
 */

import type { SourceSystem } from '@/lib/source-systems';
import type { SystemParser, ParserResult } from './types';

import { metaAdsParser } from './meta-ads';
import { tangoParser } from './tango';
import { mercadoPagoParser } from './mercado-pago';

const PARSERS: SystemParser[] = [metaAdsParser, tangoParser, mercadoPagoParser];

const MIN_CONFIDENCE = 0.7;

export interface SelectedParser {
  parser: SystemParser;
  result: ParserResult;
}

export function selectParser(
  systemId: SourceSystem | null | undefined,
  headers: string[],
): SelectedParser | null {
  if (!headers || headers.length === 0) return null;

  // Step 1: prefer the parser the user implied via the dropdown.
  if (systemId) {
    const declared = PARSERS.find(p => p.systemId === systemId);
    if (declared) {
      const confidence = declared.match(headers);
      if (confidence >= MIN_CONFIDENCE) {
        const result = declared.parse(headers);
        return { parser: declared, result };
      }
    }
  }

  // Step 2: fall back to scanning all parsers.
  let best: SelectedParser | null = null;
  for (const p of PARSERS) {
    // Skip the declared one we already tried (and rejected) above.
    if (systemId && p.systemId === systemId) continue;
    const conf = p.match(headers);
    if (conf < MIN_CONFIDENCE) continue;
    if (!best || conf > best.result.confidence) {
      best = { parser: p, result: p.parse(headers) };
    }
  }
  return best;
}

export const REGISTERED_PARSERS: readonly SystemParser[] = PARSERS;
