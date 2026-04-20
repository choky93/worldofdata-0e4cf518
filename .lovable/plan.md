

## Plan: Fix módulo Stock (unidades reales, cobertura, valoración)

### Cambios

**1. `src/lib/field-utils.ts`** — helpers reutilizables:
- `getStockUnits(row)`, `getCost(row)`, `getPrice(row)`, `getProductName(row)`, `getQuantity(row)` apoyándose en los `FIELD_*` ya existentes.

**2. `src/pages/Stock.tsx`**
- **Dedupe por nombre de producto** con esta prioridad:
  1. Fila del archivo más reciente: comparar `row.file_upload_id`, `row.uploaded_at` o `row.created_at` (lo que esté disponible en el row).
  2. Fallback: fila con mayor valor de stock.
- Reemplazar conteo de filas por suma de `getStockUnits` sobre el set dedupeado.
- Cruce con `extractedData.ventas` → ventas mensuales promedio por producto = `total_cantidad / mesesDisponibles` (usando `extractAvailableMonths` + `findDateRaw`).
- Cobertura = `(stockUnits / avgMonthlyUnits) * 30`, con guard `=0 → no-data`.
- Estado por producto: `getStockStatus(coverage, leadTime=20)` → `ok | low | critical | overstock | no-data`.
- 3 tarjetas nuevas en el header: **Valor al costo**, **Valor de venta**, **Ganancia proyectada**.
- Tarjetas existentes recalculadas sobre la base dedupeada.
- Badges de color en la tabla según `StockStatus`.

**3. `src/pages/Dashboard.tsx`**
- Recalcular los buckets que pasa a `<StockCard ok bajo critico />` usando la misma lógica dedupe + suma de unidades (no conteo de filas).

**4. `src/components/dashboard/StockCard.tsx`**
- Mantener la API. Cambiar el label central / subtítulo para reflejar **unidades en stock** en lugar de cantidad de productos.

### Detalles técnicos
- Dedupe key: `getProductName(row).toLowerCase().trim()`.
- Selector de "más reciente": `Math.max` sobre `Number(row.file_upload_id)` o `Date.parse(row.uploaded_at ?? row.created_at)` cuando existan; si ningún row tiene timestamp/id válido, fallback a mayor `getStockUnits`.
- Sin cambios de DB, RLS, hooks ni backend.

### Validación
- Donut Dashboard: total = 5.617 unidades.
- /stock: 3 tarjetas de valoración con números coherentes.
- Cobertura promedio realista (no 999); productos sin ventas → estado `no-data` (gris) y excluidos del promedio.
- Si se sube una versión nueva del archivo, el dedupe se queda con esa y descarta la vieja.

