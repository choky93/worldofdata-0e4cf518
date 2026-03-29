

# Fix: Preparar el sistema para cargas de datos grandes

## Problema

El pipeline actual funciona para archivos medianos pero tiene límites duros que truncan datos silenciosamente en archivos grandes. Un Excel de 50K filas pierde el 90% porque `MAX_EXCEL_ROWS = 5000`.

## Plan

### 1. Aumentar límites en `process-file/index.ts`

- `MAX_EXCEL_ROWS`: 5,000 → 50,000
- `MAX_CHUNKS_PER_INVOCATION`: 2 → 5 (reduce tiempo de procesamiento de 10+ min a ~4 min para archivos grandes)
- `CHUNK_ROWS`: 500 → 1,000 (menos invocaciones de IA, cada chunk más grande)

### 2. Agregar idempotencia a todos los INSERT paths

En los paths de archivos pequeños (no chunkeados) — líneas 322, 357, 369, 391, 425, 442, 461, 511, 523 — agregar un DELETE previo por `(file_upload_id, chunk_index=0)` antes de cada INSERT, igual que ya se hace en `processChunksLimited`. Esto previene duplicados en reintentos.

### 3. Agregar log de advertencia cuando se truncan datos

Si un Excel tiene más filas que el cap, registrar un warning en `processing_error` para que el usuario sepa que se truncaron datos, sin marcar el archivo como error.

### 4. Eliminar mock fallback de Stock.tsx (opcional, recomendado)

Cambiar Stock.tsx para mostrar un empty state en lugar de datos mock cuando no hay datos reales. Esto elimina la última referencia a `mock-data.ts`.

## Detalle técnico

- Cambios solo en `supabase/functions/process-file/index.ts` (constantes + ~9 puntos de INSERT) y opcionalmente `src/pages/Stock.tsx`
- No requiere migraciones SQL
- Los nuevos límites (50K filas, 1000 por chunk, 5 chunks por invocación) cubren archivos de hasta ~50K filas en una sola pasada del pipeline

