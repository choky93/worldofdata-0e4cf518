

# Auditoría completa: pipeline de subida + visualización

## Estado actual

La base de datos está limpia (0 archivos, 0 datos extraídos). No hay logs recientes de `process-file`. El código fue modificado varias veces. Esta auditoría revisa el código actual línea por línea.

## Veredicto

**El pipeline PATH A (subida desde navegador) está correcto.** Los chunk_index negativos para metadata (-2, -1) y positivos para datos (0+) evitan conflictos con el unique index. Los upserts tienen verificación de error. Las fechas se normalizan.

**Hay 3 problemas reales que necesitan corrección:**

---

### PROBLEMA 1: PATH C (`processTabularData`) borra la metadata que acaba de insertar (CRÍTICO)

**Archivo:** `supabase/functions/process-file/index.ts`, líneas 518-535

```text
Línea 519: DELETE ALL → borra TODO para este file_upload_id
Línea 523: INSERT _column_mapping → lo acaba de borrar, OK lo reinserta
Línea 537: storeRowBatch(... batchIndex=0) → OK
```

**Pero** `storeRowBatch` (línea 474) hace `DELETE .eq("chunk_index", batchIndex)` antes de insertar. Cuando `batchIndex=0`, esto NO borra la metadata porque metadata está en -1 y -2. **Esto está bien ahora.**

Sin embargo, la línea 519 `DELETE ALL` no distingue — si `processTabularData` se llama en un reproceso donde ya hay datos con metadata, los borra todos y los reinserta correctamente. **Esto funciona.**

**Conclusión: PATH C está OK.** No hay problema aquí.

---

### PROBLEMA 2: Subsequent batches buscan `_classification` que fue borrada (MEDIO)

**Archivo:** `supabase/functions/process-file/index.ts`, líneas 713-716 y 728-741

Cuando `totalBatches === 1`, el batch 0 borra `_classification` (línea 714). Esto está bien porque es el último batch.

Pero cuando hay múltiples batches, el batch 0 inserta `_classification` en chunk_index=-2. Los batches posteriores (línea 733-741) intentan leer `_classification` para obtener la categoría, y lo encuentran. Luego el último batch lo borra (línea 765). **Esto funciona correctamente.**

**Pero hay un edge case:** Si el frontend envía `explicitCategory` (línea 712, `category: resolvedCategory`), el batch posterior NO necesita leer `_classification`. Si no lo envía, lo lee. El frontend SÍ lo envía (línea 712 de CargaDatos.tsx: `...(bi > 0 && resolvedCategory ? { category: resolvedCategory } : {})`).

**Conclusión: OK, pero la lectura fallback de `_classification` podría fallar si `resolvedCategory` no se capturó. Es un riesgo menor.**

---

### PROBLEMA 3 (REAL): El reprocess de Excel en CargaDatos NO aplica `cleanParsedRows` (BUG)

**Archivo:** `src/pages/CargaDatos.tsx`, líneas 837-862

En el flujo de reprocess (handleReprocess), el código descarga el archivo, lo parsea con SheetJS, aplica `fixBrokenHeaders`, pero **NO aplica `cleanParsedRows`** antes de enviar los batches. Esto significa que:
- Las fechas seriales de Excel NO se convierten a ISO
- Las filas de totales/resumen NO se filtran

Comparar con el flujo de upload (líneas 646-648): allí SÍ aplica `cleanParsedRows`.

**Impacto:** Si el usuario reprocesa un archivo Excel, las fechas quedarán como seriales.

---

### PROBLEMA 4 (REAL): La función `cleanRows` en el edge function se aplica DESPUÉS del parseo pero NO convierte strings numéricos que ya fueron parseados por el cliente

**Archivo:** `supabase/functions/process-file/index.ts`, línea 653

El cliente (CargaDatos) aplica `cleanParsedRows` que convierte seriales a ISO. Luego envía los rows al edge function. El edge function aplica `cleanRows` otra vez (línea 653), lo cual intenta re-convertir fechas. Pero como el cliente ya convirtió "45231.0" → "2023-11-01", el edge function ve "2023-11-01" y no hace nada (correcto). **Esto está OK.**

---

### PROBLEMA 5 (REAL): `useExtractedData` no filtra `_classification` que quedó de archivos multi-batch

**Archivo:** `src/hooks/useExtractedData.ts`, línea 60

El filtro es: `.not('data_category', 'in', '("_raw_cache","_classification")')`. Esto SÍ excluye `_classification`. Pero... la `_classification` se borra al final del último batch (línea 765 del edge function). Si el procesamiento falla a mitad de camino, la `_classification` podría quedar. Sin embargo, la query la excluye. **Esto está OK.**

---

### PROBLEMA 6 (REAL): `aggregateByDate` en Ventas.tsx NO ordena por fecha

**Archivo:** `src/pages/Ventas.tsx`, línea 15-29

`aggregateByDate` usa `Map` y `.slice(-30)` pero NO ordena por fecha. Los datos pueden aparecer en cualquier orden. Solo `aggregateByMonth` ordena correctamente (línea 47).

**Impacto:** El gráfico "Ventas por fecha" puede mostrar barras desordenadas.

---

## Resumen de correcciones necesarias

| # | Archivo | Problema | Severidad |
|---|---------|----------|-----------|
| 1 | `src/pages/CargaDatos.tsx` líneas 837-862 | Reprocess no aplica `cleanParsedRows` | Alta |
| 2 | `src/pages/Ventas.tsx` líneas 15-29 | `aggregateByDate` no ordena por fecha | Media |

## Plan de implementación

### 1. CargaDatos.tsx — Agregar cleanParsedRows al reprocess

Después de `fixBrokenHeaders` (línea 855), agregar:
```typescript
const cleanedRows = cleanParsedRows(fixedRows, headers);
```
Y usar `cleanedRows` en vez de `fixedRows` para los batches.

### 2. Ventas.tsx — Ordenar aggregateByDate

Cambiar `aggregateByDate` para que almacene el Date junto al valor y ordene antes de retornar, igual que hace `aggregateByMonth`.

### No se necesitan cambios en:
- `process-file/index.ts` — la lógica actual es correcta con chunk_index -2/-1/0+
- `useExtractedData.ts` — los filtros son correctos
- `Dashboard.tsx` — el chart ordena por fecha correctamente (línea 194)
- `AppSidebar.tsx` — la visibilidad data-driven es correcta
- `Marketing.tsx` — el fallback a fecha cuando no hay campaign_name es correcto

