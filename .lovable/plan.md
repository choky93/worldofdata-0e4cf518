

# Auditoría completa: Estado actual de la plataforma

## Veredicto general

La mayoría de los módulos están correctos tras las correcciones previas. Quedan **3 bugs reales** y **2 inconsistencias menores**.

---

## BUG 1 (ALTO): Clientes.tsx — `top2Pct` usa posición en array en vez de top 2 reales

**Archivo**: `src/pages/Clientes.tsx`, líneas 83-85

```typescript
const top2Pct = clients.length >= 2 && totalSales > 0
  ? ((clients[0].totalPurchases + clients[1].totalPurchases) / totalSales * 100).toFixed(0)
  : '0';
```

`clients` NO está ordenado por `totalPurchases` en este punto. `normalizeClients` devuelve en el orden original del archivo. La línea 95 ordena solo para `chartData` (variable local). Entonces `clients[0]` y `clients[1]` son los dos primeros del archivo, no los dos mayores compradores.

**Fix**: Ordenar `clients` por `totalPurchases` descendente antes de calcular `top2Pct`, o usar `sort` inline.

---

## BUG 2 (MEDIO): Clientes.tsx — Detección de churn usa `new Date()` en vez de `parseDate`

**Archivo**: `src/pages/Clientes.tsx`, líneas 87-91

```typescript
const d = new Date(c.lastPurchase);
if (isNaN(d.getTime())) return false;
```

Si `lastPurchase` viene en formato `"25/03/2024"` (dd/mm/yyyy, común en archivos argentinos), `new Date("25/03/2024")` devuelve `Invalid Date` en la mayoría de browsers. El resultado: clientes con fecha válida NO aparecen como churn aunque deberían, y el KPI "Sin compras +30 días" muestra 0.

**Fix**: Usar `parseDate` de `data-cleaning.ts` que soporta dd/mm/yyyy, meses en español, etc.

---

## BUG 3 (MEDIO): Stock.tsx y Clientes.tsx no usan AI column mappings

**Archivo**: `src/pages/Stock.tsx`, líneas 40-64  
**Archivo**: `src/pages/Clientes.tsx`, líneas 23-37

Ambos módulos llaman `findNumber(r, FIELD_STOCK_QTY)` y `findString(r, FIELD_CLIENT)` sin pasar el `mappedCol` del AI. Si los headers del archivo no coinciden con los keywords predefinidos (pero el AI los mapeó), los datos aparecen como 0 o vacíos.

**Fix**: Consumir `mappings.stock` y `mappings.clientes` del context y pasarlos a `findNumber`/`findString`.

---

## Inconsistencia menor: Finanzas.tsx — facturas sin mappings en filterByPeriod

**Archivo**: `src/pages/Finanzas.tsx`, línea 94

```typescript
const realFacturas = period === 'all' ? allFacturas : filterByPeriod(allFacturas, FIELD_DATE, period, findString);
```

Pasa `findString` directamente sin wrappear para incluir mappings de facturas. Impacto bajo porque facturas raramente tienen headers no estándar, pero es inconsistente con ventas/gastos en las líneas 92-93.

---

## Módulos verificados sin errores

| Módulo | Estado |
|--------|--------|
| Dashboard.tsx | OK — mappings, chart sort, health radar, period filter |
| Ventas.tsx | OK — aggregateByDate sort, mappings, parseDate |
| Operaciones.tsx | OK — mappings, parseDate, sort descending |
| Metricas.tsx | OK — parseDate, mappings, aggregateByMonth |
| Forecast.tsx | OK — parseDate, mappings, Date sort |
| Marketing.tsx | OK — mappings, ROAS calc, fallback names |
| Finanzas.tsx | OK (excepto facturas minor) — mappings ventas/gastos |
| Alertas.tsx | OK — mappings stock/clientes/gastos |
| AppSidebar.tsx | OK — shared context, visibility logic |
| useExtractedData.tsx | OK — context provider, pagination, mapping merge |
| field-utils.ts | OK — 3-level matching, numeric parsing |
| data-cleaning.ts | OK — parseDate robusto |

---

## Plan de implementación

### 1. Clientes.tsx — Fix top2Pct + churn + mappings

- Consumir `mappings.clientes` del context
- Pasar `mC` a `normalizeClients` para `findNumber`/`findString`
- Ordenar clients por `totalPurchases` desc antes de calcular `top2Pct` (o usar `.sort().slice()`)
- Reemplazar `new Date(c.lastPurchase)` con `parseDate(c.lastPurchase)` en detección de churn

### 2. Stock.tsx — Agregar mappings

- Consumir `mappings.stock` del context
- Pasar `mS` a `normalizeProducts` para `findNumber`/`findString`

### Archivos a modificar

| Archivo | Cambios | Severidad |
|---------|---------|-----------|
| `src/pages/Clientes.tsx` | Mappings + fix top2Pct sort + fix churn parseDate | Alta |
| `src/pages/Stock.tsx` | Agregar mappings a normalizeProducts | Media |

