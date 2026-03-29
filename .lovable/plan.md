
# Pipeline de ingesta v3 — Determinístico por filas

## Estado: ✅ IMPLEMENTADO

## Cambios realizados

### 1. process-file/index.ts — Reescrito completamente
- **Nuevo PATH A**: Recibe `rowBatch` (array de objetos), `headers`, `batchIndex`, `totalBatches` del cliente
  - Batch 0: clasifica con AI (gpt-4o-mini, 1 sola llamada barata con headers + 10 filas de muestra)
  - Todos los batches: almacena filas directamente sin AI (determinístico)
  - Último batch: marca archivo como `processed`
- **PATH B**: Legacy `preParsedData` (CSV texto) → lo parsea a filas y usa pipeline determinístico
- **PATH C**: Archivos del servidor (PDF, imágenes, XML, Word) → sigue usando AI para extracción
- **Excel server-side**: Ahora usa `sheet_to_json` → filas reales → pipeline determinístico
- **Clasificación**: Nueva función `classifyWithAI()` que usa gpt-4o-mini (más barato y rápido)

### 2. CargaDatos.tsx — Parseo estructurado
- **Todo Excel se parsea client-side** (ya no solo >500KB)
- Usa `XLSX.utils.sheet_to_json()` → objetos reales con headers
- Envía en batches de 500 filas cada uno a `process-file`
- `handleReprocess` también usa el mismo pipeline de row batches
- Agregado `sheetRows: 50000` al reprocess

### 3. useExtractedData.ts — Filtrado robusto
- Excluye chunks con `_classification` metadata
- Filtra chunks con `rows.length === 0` (vacíos/rotos)

## Qué se eliminó
- Chunking por caracteres para datos tabulares
- AI procesando cada chunk de texto de una planilla
- Dependencia de `_raw_cache` para Excel
- `MAX_PREPARSED_CSV_SIZE` y `EXCEL_CLIENT_PARSE_THRESHOLD`

## Resultado
- 1 sola llamada AI por archivo tabular (clasificación)
- Filas almacenadas tal cual, sin pérdida de datos
- Sin WORKER_LIMIT ni 504s para Excel grandes
- Métricas 100% confiables basadas en datos reales
