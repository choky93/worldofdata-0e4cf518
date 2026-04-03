

# Auditoría completa: Sidebar ↔ Secciones ↔ Métricas cruzadas

## Verificación de rutas

Todas las 13 rutas del sidebar (`adminItems`) tienen su correspondiente `<Route>` en `App.tsx` y su página importada. No hay discrepancias.

| Sidebar | Ruta | Página | ✓ |
|---------|------|--------|---|
| Dashboard | /dashboard | Dashboard.tsx | OK |
| Ventas | /ventas | Ventas.tsx | OK |
| Finanzas | /finanzas | Finanzas.tsx | OK |
| Stock | /stock | Stock.tsx | OK |
| Clientes | /clientes | Clientes.tsx | OK |
| Forecast | /forecast | Forecast.tsx | OK |
| Alertas | /alertas | Alertas.tsx | OK |
| Métricas | /metricas | Metricas.tsx | OK |
| Marketing | /marketing | Marketing.tsx | OK |
| Operaciones | /operaciones | Operaciones.tsx | OK |
| Carga de datos | /carga-datos | CargaDatos.tsx | OK |
| Equipo | /equipo | Equipo.tsx | OK |
| Configuración | /configuracion | Configuracion.tsx | OK |

## Visibilidad condicional del sidebar

El sidebar filtra `Stock` y `Marketing` así:
- **Stock**: visible si `companySettings.has_stock || companySettings.sells_products || hasStockData`
- **Marketing**: visible si `companySettings.uses_meta_ads || companySettings.uses_google_ads || hasMarketingData`

Con el nuevo `ExtractedDataProvider` compartido + `refetch()` después de subir archivos, esto funciona correctamente.

**Dashboard** usa la misma lógica idéntica para mostrar/ocultar KPI de Marketing y el health radar de Stock. **Consistente.**

## Consistencia de datos cruzados entre secciones

### Ventas total — se usa en 4 lugares

| Módulo | Cálculo | Consistente |
|--------|---------|-------------|
| Dashboard KPI | `realVentas.reduce(sum + findNumber(r, FIELD_AMOUNT, mV?.amount))` | ✓ |
| Ventas.tsx | `realVentas.reduce(sum + findNumber(r, FIELD_AMOUNT, m?.amount))` | ✓ |
| Finanzas.tsx | `realVentas.reduce(s + findNumber(r, FIELD_AMOUNT, mV?.amount))` | ✓ |
| Operaciones.tsx | `ventas.forEach → findNumber(r, FIELD_AMOUNT)` | **⚠ No usa mappings** |
| Metricas.tsx | `realVentas.reduce(s + findNumber(r, FIELD_AMOUNT))` | **⚠ No usa mappings** |

### Gastos total — se usa en 3 lugares

| Módulo | Cálculo | Consistente |
|--------|---------|-------------|
| Dashboard KPI | `realGastos.reduce(sum + findNumber(r, FIELD_AMOUNT, mG?.amount))` | ✓ |
| Finanzas.tsx | `realGastos.reduce(s + findNumber(r, FIELD_AMOUNT, mG?.amount))` | ✓ |
| Operaciones.tsx | `gastos.forEach → findNumber(r, FIELD_AMOUNT)` | **⚠ No usa mappings** |
| Metricas.tsx | `realGastos.reduce(s + findNumber(r, FIELD_AMOUNT))` | **⚠ No usa mappings** |

### Marketing spend — se usa en 2 lugares

| Módulo | Cálculo | Consistente |
|--------|---------|-------------|
| Dashboard KPI | `realMarketing.reduce(sum + findNumber(r, FIELD_SPEND, mM?.spend))` | ✓ |
| Marketing.tsx | `findNumber(r, FIELD_SPEND, m?.spend)` | ✓ |

---

## PROBLEMAS ENCONTRADOS

### BUG 1 (MEDIO): Operaciones.tsx no usa column mappings

**Archivo**: `src/pages/Operaciones.tsx`, líneas 33-34, 44-46

`normalizeOps` llama `findNumber(r, FIELD_AMOUNT)` y `findString(r, FIELD_DATE)` **sin pasar el mappedCol del AI**. Si la columna de montos del archivo se llama `Monto_Total_Mensual` (y el AI la mapeó como `amount`), `findNumber` la encuentra por keyword match. Pero si la columna tiene un nombre no estándar que solo el AI mapping conoce, Operaciones mostrará `$0` mientras Dashboard y Ventas muestran el valor correcto.

**Fix**: Consumir `mappings.ventas` y `mappings.gastos` del context y pasarlos a `findNumber`/`findString`.

### BUG 2 (MEDIO): Metricas.tsx no usa column mappings

**Archivo**: `src/pages/Metricas.tsx`, líneas 70, 86, 114-116

Mismo problema que Operaciones. `aggregateByMonth` llama `findString(r, FIELD_DATE)` y `findNumber(r, fieldKeywords)` sin mappings. Si las columnas tienen nombres no estándar, las métricas estarán en 0 o sin fecha.

**Fix**: Pasar mappings a `aggregateByMonth`.

### BUG 3 (MEDIO): Forecast.tsx no usa column mappings NI parseDate centralizado

**Archivo**: `src/pages/Forecast.tsx`, líneas 12-45

`aggregateSalesByMonth` implementa su propia lógica de parseo de fechas (manual con `new Date()`, regex para ISO, regex para dd/mm/yyyy) en vez de usar `parseDate` de `data-cleaning.ts`. Esto significa:
- No soporta meses en español ("Enero 2024")
- No soporta trimestres ("Q1 2024")  
- No soporta semanas ("Semana 12 2024")
- No soporta seriales de Excel

Además, no usa `mappings.ventas` para encontrar la columna de fecha ni la de monto.

**Fix**: Reescribir `aggregateSalesByMonth` para usar `parseDate` y `findNumber`/`findString` con mappings.

### BUG 4 (MEDIO): Metricas.tsx `aggregateByMonth` tiene el mismo problema de parseo

**Archivo**: `src/pages/Metricas.tsx`, líneas 67-93

Usa `new Date(raw)` + regex manuales en vez de `parseDate`. Mismo riesgo que Forecast: fechas en formatos soportados por `parseDate` pero no por este código manual no se parsean.

**Fix**: Reemplazar por `parseDate`.

### BUG 5 (BAJO): Forecast.tsx sort por fecha es frágil

**Archivo**: `src/pages/Forecast.tsx`, líneas 39-42

El sort usa `new Date(s.replace(...))` con un regex que intenta parsear "ene 2024" como fecha JS. Esto falla para meses en español que JS no reconoce, resultando en `NaN` → orden indeterminado.

**Fix**: Almacenar el `Date` original como en Ventas.tsx.

### BUG 6 (BAJO): Finanzas.tsx `normalizeExpenses` no usa mappings

**Archivo**: `src/pages/Finanzas.tsx`, líneas 38-51

`normalizeExpenses` llama `findString(r, ['estado', 'status'])` y `findString(r, FIELD_NAME)` sin mappings. No es grave porque los gastos suelen tener headers estándar, pero es inconsistente con el resto.

### BUG 7 (BAJO): Alertas.tsx no usa mappings

**Archivo**: `src/pages/Alertas.tsx`, líneas 25-28, 45-46

`buildAlertsFromData` usa `findNumber(r, FIELD_STOCK_QTY)` sin mappings. Si el AI mapeó la columna de stock con un nombre no estándar, las alertas de stock no se generarán.

### BUG 8 (INFORMATIVO): Configuracion.tsx toggle de Marketing activa `uses_meta_ads` pero no `uses_google_ads`

**Archivo**: `src/pages/Configuracion.tsx`, líneas 36-38

Al activar Marketing, solo se setea `uses_meta_ads = true`. Al desactivar, se apagan ambos (`uses_meta_ads = false, uses_google_ads = false`). Pero si el usuario solo usa Google Ads y activa el toggle, se prende `uses_meta_ads` (que no usa). No afecta funcionalidad porque la condición del sidebar es OR, pero es semánticamente incorrecto.

### No hay problemas en:
- **Dashboard.tsx** — Usa mappings correctamente para ventas, gastos y marketing. Gráfico ordena por fecha. Health radar filtra condicionalmente. **OK.**
- **Ventas.tsx** — `aggregateByDate` y `aggregateByMonth` usan `parseDate` y mappings. Ordena por fecha. **OK.**
- **Marketing.tsx** — Usa mappings para todos los campos. Fallback inteligente de nombre a fecha. **OK.**
- **Stock.tsx** — Usa keywords directos (sin mappings pero Stock rara vez necesita AI mapping). **OK.**
- **Clientes.tsx** — Usa keywords directos. **OK.**
- **AppSidebar.tsx** — Consume context compartido. Visibilidad data-driven funciona. **OK.**
- **field-utils.ts** — 3 niveles de búsqueda (exact → normalized → partial + inference). **OK.**
- **data-cleaning.ts** — `parseDate` es robusto. `filterByPeriod` funciona. **OK.**

---

## Plan de implementación

### 1. Operaciones.tsx — Agregar mappings

Consumir `mappings` del context. Pasar `mV` y `mG` a `normalizeOps`. Actualizar `findNumber` y `findString` para usar los mapped columns.

### 2. Metricas.tsx — Usar parseDate + mappings

Reescribir `aggregateByMonth` para usar `parseDate` de `data-cleaning.ts` en vez del parseo manual. Consumir `mappings` del context y pasar `mV.amount`, `mG.amount`, `mV.date`, `mG.date` a las funciones de agregación.

### 3. Forecast.tsx — Usar parseDate + mappings

Reescribir `aggregateSalesByMonth` para usar `parseDate`. Consumir `mappings.ventas` y pasarlos a `findString`/`findNumber`. Almacenar `Date` para sort robusto (como hace Ventas.tsx).

### 4. Finanzas.tsx — Pasar mappings a normalizeExpenses

Agregar `mG` a `normalizeExpenses` para `findString` con mapped columns.

### 5. Alertas.tsx — Pasar mappings a buildAlertsFromData

Consumir `mappings` y pasarlos a los `findNumber`/`findString` dentro de `buildAlertsFromData`.

## Archivos a modificar

| Archivo | Cambio | Severidad |
|---------|--------|-----------|
| `src/pages/Operaciones.tsx` | Agregar mappings a normalizeOps | Media |
| `src/pages/Metricas.tsx` | Reemplazar parseo manual por parseDate + mappings | Media |
| `src/pages/Forecast.tsx` | Reemplazar parseo manual por parseDate + mappings + sort robusto | Media |
| `src/pages/Finanzas.tsx` | Pasar mappings a normalizeExpenses | Baja |
| `src/pages/Alertas.tsx` | Pasar mappings a buildAlertsFromData | Baja |

## Resultado esperado

- Todas las secciones usan los mismos column mappings del AI → números consistentes en toda la plataforma.
- Todas las secciones usan `parseDate` centralizado → soporte uniforme de formatos de fecha.
- Los totales de ventas/gastos coinciden entre Dashboard, Ventas, Finanzas, Operaciones y Métricas.

