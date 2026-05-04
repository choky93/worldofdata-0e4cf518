# Wave A/B/C — Source-System Segmentation

Branch: `feature/source-system-segmentation`
Base: `origin/main` @ 193cb4c

## Commits

| Wave | SHA | Title |
|------|-----|-------|
| A    | ff3349e | Wave A: source-system segmentation (capture + propagate hint) |
| B    | 9d86a41 | Wave B: deterministic parsers for Meta Ads + Tango + Mercado Pago |
| C.3  | 9d2297a | Wave C.3: client-side header → mapping cache |

## What was done

### Wave A — Capture + propagate origin (DONE)
- **Migration** `supabase/migrations/20260504100000_add_source_system.sql`: nullable `file_uploads.source_system` text column + partial index. **NOT applied** — apply manually.
- **Constants** `src/lib/source-systems.ts`: `Category`, `SourceSystem` types, `SOURCE_SYSTEMS_BY_CATEGORY`, `SOURCE_SYSTEM_LABELS`, `CATEGORY_LABELS`, `getSystemsForCategory`, `getSystemLabel`, `isSourceSystem`.
- **UI** `src/pages/CargaDatos.tsx`: two mandatory `<Select>` controls (Categoría + Sistema) above the dropzone. Dropzone is disabled and shows a hint message until both are picked. Selection is snapshotted per upload batch so concurrent uploads aren't affected by mid-flight changes.
- **DB types** `src/integrations/supabase/types.ts`: `source_system: string | null` added to Row/Insert/Update of `file_uploads`.
- **Edge function** `supabase/functions/process-file/index.ts`: reads `source_system` from `file_uploads`, prepends a tailored prompt preamble with expected column hints for 19 known origins (Meta/Google/TikTok/LinkedIn/Mailchimp Ads, Tango, Bejerman, Contabilium, Xubio, Mercado Pago, AFIP, Mercado Libre, Tienda Nube, Shopify, Pipedrive, HubSpot, Salesforce, Zoho).
- Per-sheet inserts (multi-sheet workbooks) inherit the same `source_system`.

### Wave B — Deterministic parsers (DONE)
- `src/lib/parsers/types.ts` — `SystemParser`/`ParserResult` interfaces, `findHeader`, `countMatches`, `normalizeHeader` helpers.
- `src/lib/parsers/meta-ads.ts` — Meta Ads Manager (Spanish + English headers).
- `src/lib/parsers/tango.ts` — Tango Gestión, distinguishes Ventas vs Stock exports.
- `src/lib/parsers/mercado-pago.ts` — MP "Reporte de actividad" (uses Dinero recibido as the canonical amount).
- `src/lib/parsers/router.ts` — `selectParser(systemId, headers)`. Tries the user-declared system first; falls back to scanning all parsers; returns null below 0.7 confidence.
- **Edge function** accepts new body fields: `precomputedMapping`, `precomputedSummary`, `localParserName`. When the user-side parser ran with confidence ≥ 0.8 these are forwarded inline, and `classifyWithAI` is skipped entirely.
- **Toast** notifies the user when a local parser was used: "Procesado localmente con parser X — ahorraste ~70% costo de IA."

### Wave C — AI cost optimisations (PARTIAL)
- **C.1 Model swap to GPT-4.1-mini — NOT APPLICABLE.** The project uses Anthropic Claude (`claude-sonnet-4-5`), not OpenAI/GPT. There is no GPT-4.1-mini equivalent we can drop in conservatively. A Claude Haiku swap is possible but risks quality regressions for ambiguous classifications; left for the user to decide.
- **C.2 Sample mode — ALREADY IMPLEMENTED.** `classifyWithAI` already operates on `rowBatch.slice(0, 10)` (headers + 10 rows). The full batches go through deterministic cleaning paths but never feed the classification call.
- **C.3 Mapping cache — DONE.** `src/lib/mapping-cache.ts`: SHA-256 of sorted lowercase headers, 30-day TTL, 50-entry LRU, persisted in localStorage. Cache hits forward `precomputedMapping` inline (same plumbing as Wave B). Cache writes happen after a successful AI batch-0 by re-reading the persisted `_classification` row.

## Validation

- `npx tsc --noEmit -p tsconfig.app.json` → clean after each commit.
- `npm run build` → clean after each commit.
- No new dependencies. All UI text in Spanish matching existing tone.

## Manual steps for the user

1. **Apply the migration**: run `supabase/migrations/20260504100000_add_source_system.sql` against the database (or `supabase db push`). Until this is applied, the new `source_system` column won't exist and the inserts will fail. The branch can still be reviewed pre-migration; just don't merge to a deployed environment first.
2. **Optionally regenerate Supabase types** with `supabase gen types typescript ...` to confirm `source_system` is detected (the file was edited by hand to keep things in sync without a regen step).

## Open decisions / notes

- **Existing files (NULL `source_system`)** continue to work unchanged — they fall through to the AI classification path with no source preamble. Back-compat preserved.
- **The dropzone now blocks until selection is made.** This is a deliberate UX shift — "always require origin" is the spec. If you want to allow legacy "no idea" uploads, add an `otro / Excel manual` shortcut button (already covered by the existing `otro` category, but the user has to click both selects).
- **Local parser confidence threshold is 0.8.** Below that we still fall back to AI. The router exposes a 0.7 floor for matching at all. Bump these if you see misclassifications.
- **Mapping cache is per-browser.** A team-shared cache would require a Supabase table — out of scope here.
- **Per-sheet `source_system`.** Multi-sheet workbooks all get the same declared origin. If a workbook mixes (e.g.) Tango Ventas + Tango Stock that's fine; the parser distinguishes them via headers. If it mixes truly different origins (rare), declare "otro".
- **Commit C.1.** Skipped intentionally; documented above.
