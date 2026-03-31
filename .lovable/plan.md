

# Plan: Corregir distribución de datos extraídos

## Diagnóstico concreto

Revisé la base de datos del cliente y encontré **dos problemas reales**:

### Problema 1: Headers rotos (`__EMPTY`)
Los archivos Excel del cliente tienen filas de título antes de los datos reales. Por ejemplo:
- Fila 1: `"Informe detallado - Ganancias."` (título)
- Fila 2: `Identificador | Fecha | Producto | Cantidad | Ganancia` (headers reales)
- Fila 3+: datos

SheetJS toma la fila 1 como headers, generando columnas `__EMPTY`, `__EMPTY_1`, etc. Resultado: el sistema no puede leer fecha, producto, ganancia, etc.

**Impacto:** 136,378 filas quedaron como categoría `otro` con columnas ilegibles. No aparecen en Ventas, Stock, ni ningún módulo.

### Problema 2: Clasificación que no se propaga entre batches
Batch 0 se clasifica correctamente como `ventas`, pero los batches 1-66 caen a `otro`. Esto pasa porque los batches se envían en paralelo desde el navegador y los posteriores no encuentran el registro `_classification` a tiempo (race condition).

**Evidencia directa:**
- `Informe Ganancia de productos vendidos.xlsx`: batch 0 = `ventas`, batches 1-66 = `otro`
- `informe productos mas vendidos .xls`: mismo patrón
- Solo 2,026 filas aparecen como `ventas` de un total de ~138,000

## Soluciones

### 1. Detección inteligente de headers en Excel
Antes de enviar las filas, detectar si la primera fila es un título (no headers reales) y buscar la fila correcta de headers.

Lógica:
- Si más del 50% de las columnas se llaman `__EMPTY*`, buscar en las primeras 10 filas una que tenga más columnas con texto real
- Usar esa fila como header y descartar las anteriores
- Re-mapear las filas restantes con los headers correctos

**Archivo:** `src/pages/CargaDatos.tsx` (en el bloque de parseo client-side)

### 2. Envío secuencial de batches (no paralelo)
El código actual ya envía batches en un `for` loop secuencial, pero la race condition puede ocurrir si el `INSERT` de `_classification` no se confirma antes del siguiente batch. Solución: el batch 0 ya devuelve `category` en la respuesta — usar ese valor para los batches siguientes sin depender del lookup en la DB.

**Archivo:** `src/pages/CargaDatos.tsx` (en el loop de envío de batches)

### 3. Migración de datos existentes
Los archivos ya cargados tienen headers rotos. Opciones:
- El usuario los reprocesa (botón ya existe)
- O ejecutamos una corrección automática que re-categorice chunks `otro` que pertenecen a archivos cuyo batch 0 es `ventas`

**Archivo:** Migración SQL simple para re-categorizar los chunks huérfanos

### 4. Aplicar mismo fix al `handleReprocess`
El reprocessing también parsea Excel — necesita la misma lógica de detección de headers.

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/CargaDatos.tsx` | Detección de headers reales en parseo Excel + pasar `category` del batch 0 a los siguientes |
| `supabase/functions/process-file/index.ts` | Aceptar `category` como parámetro opcional para batches > 0 (evita lookup) |
| Migración SQL | Re-categorizar chunks `otro` de archivos que ya tienen batch 0 con categoría correcta |

## Resultado esperado

- Las 136,378 filas que hoy están en `otro` pasan a `ventas` (o la categoría correcta)
- Dashboard, Ventas, Finanzas muestran los datos reales del cliente
- Nuevas cargas detectan headers correctamente sin importar si el Excel tiene filas de título

