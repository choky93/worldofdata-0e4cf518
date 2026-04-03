

# Auditoría completa: Pipeline de subida + visualización

## Verificación de datos en base

Confirmado en la DB que los datos existen correctamente:
- **Ventas**: 26 filas, `data_category: ventas`, `chunk_index: 0`, fechas ISO normalizadas (`2023-11-01`)
- **Marketing**: 6 filas, `data_category: marketing`, `chunk_index: 0`
- **Column mappings**: 2 registros `_column_mapping` con `chunk_index: -1` (uno para ventas, uno para marketing)
- **Classification**: ya borrados correctamente (no quedan residuos)

Los chunk_index -2/-1/0 funcionan correctamente. Los logs del edge function confirman: `✅ Stored _classification at chunk_index=-2`, `✅ Stored _column_mapping at chunk_index=-1`.

## BUG ENCONTRADO: Marketing no aparece en sidebar (RAÍZ REAL)

**Problema**: El sidebar llama `useExtractedData()` que crea su propia instancia independiente del hook. El hook hace `fetchData` una sola vez al montar (via `useEffect`). Como el sidebar **se monta una sola vez** (persiste entre navegaciones), si se montó ANTES de que el usuario subiera archivos, la instancia del sidebar tiene datos vacíos (`marketing: []`) y **nunca refetcha**.

El Dashboard sí muestra datos porque se re-monta al navegar a él (genera un nuevo `useEffect`).

**Condición del sidebar** (línea 53):
```
companySettings.uses_meta_ads || companySettings.uses_google_ads || hasMarketingData
```
- `uses_meta_ads: false`, `uses_google_ads: false` (DB confirmado)
- `hasMarketingData` = `(extractedData?.marketing || []).length > 0` → `false` porque el hook tiene datos stale

**Resultado**: Marketing nunca aparece en sidebar aunque los datos existen en la DB.

**Mismo problema aplica a Stock**: si se sube un archivo de stock después del montaje del sidebar, no va a aparecer.

### Solución

Convertir `useExtractedData` en un React Context compartido (provider). Así todas las instancias comparten el mismo estado. Cuando CargaDatos termina de subir archivos, llama `refetch()` del context, y el sidebar se actualiza automáticamente.

## Resto de la auditoría: sin errores críticos

### Edge function `process-file` — OK
- **PATH A** (browser batches): chunk_index -2/-1/0+ correctos. Upserts con onConflict. Verificación de error en todos los inserts. `cleanRows` aplica `convertSerialDates` con `mappedDate` del AI. **Correcto.**
- **PATH B** (legacy preParsed): pasa por `processTabularData`. **Correcto.**
- **PATH C** (server-side R2): descarga, parsea, pasa por `processTabularData`. Delete-all primero, luego insert _column_mapping, luego batches. **Correcto.**
- Quarantine re-analysis: detecta mapping insuficiente y re-analiza. **Correcto.**
- DATE_KW incluye "mes". **Correcto.**

### `CargaDatos.tsx` — OK
- Upload flow: `cleanParsedRows` se aplica tanto en upload (línea 647) como en reprocess (línea 860). **Correcto.**
- Health check excluye `_column_mapping` y `_classification`. **Correcto.**
- Multi-sheet Excel: concatena sheets con mismos headers. **Correcto.**

### `useExtractedData.ts` — OK (excepto el singleton issue)
- Filtro `.not('data_category', 'in', '("_raw_cache","_classification")')` excluye metadata correctamente. **Correcto.**
- Separación de `_column_mapping` en el loop de procesamiento. **Correcto.**
- Paginación para superar el límite de 1000 rows. **Correcto.**

### `Ventas.tsx` — OK
- `aggregateByDate` ordena por fecha correctamente (sort con Date.getTime). **Correcto.**
- `aggregateByMonth` ordena por fecha. **Correcto.**
- Columnas dinámicas (oculta Cliente/Detalle si no hay datos). **Correcto.**

### `Dashboard.tsx` — OK
- Sales chart ordena por fecha con `sort`. **Correcto.**
- Health radar muestra marketing condicionalmente. **Correcto.**

### `Marketing.tsx` — OK
- `normalizeMarketing` calcula ROAS correctamente. **Correcto.**
- Fallback de nombre a fecha cuando no hay campaign_name. **Correcto.**
- Muestra/oculta columnas dinámicamente según datos existentes. **Correcto.**

### `data-cleaning.ts` — OK
- `parseDate` cubre ISO, dd/mm/yyyy, meses en español, trimestres, semanas, seriales. **Correcto.**
- `filterByPeriod` funciona con la función `findString` pasada como parámetro. **Correcto.**

### `field-utils.ts` — OK
- `findNumber` prioriza mappedCol > keywords > inference. **Correcto.**
- `parseNumericValue` maneja formatos argentinos (puntos como separadores de miles). **Correcto.**

## Resumen

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | Sidebar `useExtractedData` nunca refetcha → Marketing/Stock invisibles | **Alta** | `src/hooks/useExtractedData.ts`, `src/components/AppSidebar.tsx`, `src/pages/CargaDatos.tsx` |

Solo hay 1 bug real. Todo lo demás funciona correctamente.

## Plan de implementación

### 1. Crear `ExtractedDataProvider` context

Convertir `useExtractedData` en un context provider que se monta en `AppLayout`. Todos los consumidores (`AppSidebar`, `Dashboard`, `Ventas`, `Marketing`, etc.) comparten la misma instancia y los mismos datos.

**Archivo**: `src/hooks/useExtractedData.ts`
- Agregar `ExtractedDataProvider` y `useExtractedData` como context consumer
- El provider hace el fetch una vez y expone `data`, `mappings`, `loading`, `hasData`, `refetch`

**Archivo**: `src/components/AppLayout.tsx`
- Envolver el layout en `<ExtractedDataProvider>`

### 2. CargaDatos llama `refetch()` después de subir archivos

**Archivo**: `src/pages/CargaDatos.tsx`
- Después de `Promise.all(activePromises)` (línea 762), llamar `refetch()` del context
- Esto actualiza automáticamente el sidebar y cualquier otro consumidor

### Resultado esperado
- Marketing aparece en el sidebar inmediatamente después de subir un archivo de marketing
- Stock aparece en el sidebar inmediatamente después de subir un archivo de stock
- No hay más instancias duplicadas del fetch — un solo fetch compartido
- Los módulos (Dashboard, Ventas, Marketing) todos ven los mismos datos sin fetches independientes

