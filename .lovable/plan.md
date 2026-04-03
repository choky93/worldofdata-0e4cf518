

# Plan: Mapeo inteligente de columnas con IA — solución definitiva

## El problema de fondo

Hoy el sistema clasifica bien (ventas, marketing, etc.) pero después **adivina** qué columna es el monto, qué columna es la fecha, etc. usando listas de keywords fijas (`FIELD_AMOUNT = ['monto', 'total', 'amount', ...]`). Esto funciona con algunos archivos y falla con otros porque:

- Un cliente puede tener columna `Total Mensual (IVA Inc.)` — matchea parcialmente
- Otro puede tener `Facturación bruta` — no matchea con nada
- Otro puede tener `Monto c/IVA`, `Ingreso neto`, `Vta. Contado`
- Formatos de fecha: `Enero 2024`, `Ene-24`, `1er Trim`, `Semana 12`, `01/03/2024`, `2024-03-01`
- Formatos de número: `$1.234.567,89` (ARG), `1,234,567.89` (US), `1234567`
- Archivos con columnas en inglés, español, o mezclados
- Reportes bancarios, contables, de e-commerce — cada uno con su propia nomenclatura

No importa cuántas keywords agreguemos, siempre va a haber un archivo que rompa. **La lista de keywords es un approach que no escala.**

## La solución: Column Mapping con IA

En vez de adivinar con keywords, **pedirle a la IA que nos diga el mapeo de columnas** al momento de clasificar. Hoy ya hacemos una llamada a OpenAI para clasificar (batch 0). Extendemos esa misma llamada para que también devuelva:

```text
{
  "category": "ventas",
  "summary": "Ventas mensuales con IVA",
  "column_mapping": {
    "amount": "Total Mensual (IVA Inc.)",
    "date": "Mes",
    "name": null,
    "client": null
  }
}
```

Ese mapeo se guarda junto con los datos y los módulos lo usan directamente en vez de buscar por keywords. Si la IA dice que `Total Mensual (IVA Inc.)` es el campo de monto, no hay ambigüedad.

## Cambios concretos

### 1. `supabase/functions/process-file/index.ts` — Extender `classifyWithAI`

El prompt de clasificación ya recibe headers + 10 filas de ejemplo. Se le agrega al JSON de respuesta un campo `column_mapping` con mapeos semánticos:

- Para **ventas**: `amount`, `date`, `name`, `client`, `category`
- Para **marketing**: `spend`, `date`, `campaign_name`, `clicks`, `impressions`, `conversions`, `reach`, `roas`, `ctr`, `revenue`
- Para **gastos**: `amount`, `date`, `name`, `category`, `status`
- Para **stock**: `name`, `quantity`, `price`, `cost`, `min_stock`
- Para **clientes**: `name`, `total_purchases`, `debt`, `last_purchase`, `purchase_count`

El mapeo se guarda en el chunk de `_classification` que ya existe.

### 2. `src/hooks/useExtractedData.ts` — Cargar column mappings

Al traer los datos, también traer los chunks `_classification` y extraer los `column_mapping`. Exponerlos como parte del return del hook: `{ data, mappings, loading, hasData }`.

### 3. `src/lib/field-utils.ts` — Función `resolveField` con mapping priority

Nueva función que primero busca en el column_mapping (si existe), y solo cae al keyword matching como fallback:

```text
resolveField(row, semanticKey, mapping?) →
  1. Si mapping tiene key → usar ese nombre de columna directo
  2. Si no → fallback a findField con keywords (como ahora)
```

### 4. Módulos (`Ventas.tsx`, `Marketing.tsx`, `Dashboard.tsx`, `Finanzas.tsx`)

Reciben el mapping del hook y lo pasan a `resolveField`. El código cambia mínimamente — en vez de `findNumber(r, FIELD_AMOUNT)` pasa a ser `findNumber(r, FIELD_AMOUNT, mapping?.amount)`.

### 5. Normalización de fechas diversas

Mejorar `parseDate` en `data-cleaning.ts` para soportar formatos adicionales:
- `Enero 2024`, `Ene 2024`, `Ene-24` → parse por nombre de mes en español
- `Q1 2024`, `1T 2024` → primer día del trimestre
- `Semana 12 2024` → lunes de esa semana
- Números seriales (ya implementado)

### 6. Normalización de números argentinos

Mejorar `findNumber` para manejar mejor formato `$1.234.567,89` (ya parcialmente implementado, pero verificar edge cases con montos grandes).

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/process-file/index.ts` | Extender prompt de clasificación para devolver `column_mapping` y guardarlo |
| `src/hooks/useExtractedData.ts` | Cargar y exponer `column_mapping` por archivo/categoría |
| `src/lib/field-utils.ts` | Agregar `resolveField` con prioridad mapping > keywords |
| `src/lib/data-cleaning.ts` | Mejorar `parseDate` con formatos en español y trimestrales |
| `src/pages/Ventas.tsx` | Usar mappings del hook |
| `src/pages/Marketing.tsx` | Usar mappings del hook |
| `src/pages/Dashboard.tsx` | Usar mappings del hook |
| `src/pages/Finanzas.tsx` | Usar mappings del hook |

## Por qué esto cubre "todos los flancos"

- **Archivos nuevos con columnas raras**: La IA lee los headers reales y dice cuál es cuál. No depende de keywords fijas.
- **Idioma mixto**: La IA entiende español, inglés, Spanglish, abreviaciones.
- **Formatos de fecha diversos**: `parseDate` mejorado + la IA identifica cuál columna es fecha.
- **Formatos numéricos locales**: Ya está parcialmente cubierto, se refuerza.
- **Fallback seguro**: Si la IA no puede mapear, se cae al keyword matching actual (no se rompe nada).
- **Costo cero extra**: Se agrega al mismo llamado de clasificación que ya se hace, sin llamadas API adicionales.

## Resultado esperado

Un cliente sube cualquier archivo tabular → la IA clasifica Y mapea columnas → los módulos usan el mapeo directo → los datos se muestran correctamente sin importar cómo se llamen las columnas originales.

