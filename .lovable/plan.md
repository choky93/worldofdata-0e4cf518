

# Auditoría completa: Estado actual de la plataforma

## Veredicto

**No quedan bugs críticos.** Los fixes anteriores (mappings, parseDate, context provider, top2Pct sort) están todos correctamente implementados. Queda **1 inconsistencia menor** y **1 detalle cosmético**.

---

## Módulo por módulo

| Módulo | Mappings | parseDate | Sort | Context | Veredicto |
|--------|----------|-----------|------|---------|-----------|
| Dashboard.tsx | mV, mG, mM | parseDate | sort by date.getTime() | useExtractedData() | OK |
| Ventas.tsx | m (ventas) | parseDate | sort by date.getTime() | useExtractedData() | OK |
| Finanzas.tsx | mV, mG, mF | N/A (filterByPeriod) | N/A | useExtractedData() | 1 minor |
| Stock.tsx | mS | N/A | N/A | useExtractedData() | OK |
| Clientes.tsx | mC | parseDate (churn) | sorted for top2Pct | useExtractedData() | OK |
| Forecast.tsx | mV (date, amount) | parseDate | sort by date.getTime() | useExtractedData() | OK |
| Alertas.tsx | mS, mC, mG | N/A | N/A | useExtractedData() | OK |
| Metricas.tsx | mV, mG, mS | parseDate | sort by date.getTime() | useExtractedData() | OK |
| Marketing.tsx | m (marketing) | parseDate | N/A | useExtractedData() | OK |
| Operaciones.tsx | mV, mG | parseDate | sort descending | useExtractedData() | OK |
| AppSidebar.tsx | N/A | N/A | N/A | useExtractedData() | OK |
| useExtractedData.tsx | Context provider | N/A | N/A | Provider | OK |

---

## Inconsistencia menor: Finanzas.tsx — totalFacturasReal sin mapping

**Archivo**: `src/pages/Finanzas.tsx`, línea 99

```typescript
const totalFacturasReal = realFacturas.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT), 0);
```

Falta `mF?.amount` como tercer argumento. Si la columna de monto de facturas tiene un nombre no estándar mapeado por AI, el total se mostrará como $0.

**Fix**: Cambiar a `findNumber(r, FIELD_AMOUNT, mF?.amount)`.

---

## Detalle cosmético: Clientes.tsx — `.sort()` muta el array original

**Archivo**: `src/pages/Clientes.tsx`, línea 97

```typescript
const chartData = clients.sort(...)
```

`.sort()` muta `clients` in-place. La tabla de abajo (línea 195) termina renderizando en orden descendente por compras. Funciona, pero el comportamiento depende del orden de evaluación. No es un bug — solo una nota de estilo.

---

## Todo lo demás está correcto

- **Consistency de totales**: Dashboard, Ventas, Finanzas, Operaciones y Métricas calculan ventas/gastos con el mismo patrón `findNumber(r, FIELD_AMOUNT, mX?.amount)`.
- **Sidebar visibility**: Compartido vía context, `refetch()` después de upload. Correcto.
- **Date parsing**: Todos los módulos con fechas usan `parseDate` centralizado. Correcto.
- **Column mappings**: Todos los módulos consumen mappings del context. Correcto.
- **Period filter**: Dashboard, Ventas, Finanzas y Marketing usan `filterByPeriod` con wrapper de mappings. Correcto.

---

## Plan de implementación

### 1. Finanzas.tsx — Agregar mapping a totalFacturasReal

Cambiar línea 99 de `findNumber(r, FIELD_AMOUNT)` a `findNumber(r, FIELD_AMOUNT, mF?.amount)`.

### Archivos a modificar

| Archivo | Cambio | Severidad |
|---------|--------|-----------|
| `src/pages/Finanzas.tsx` | Agregar `mF?.amount` a totalFacturasReal | Baja |

Un solo cambio de una línea. La plataforma está esencialmente libre de errores.

