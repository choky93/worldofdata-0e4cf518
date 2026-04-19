
Objetivo: resolver el bug de fechas del libro de ventas sin romper históricos, atacando el problema en dos capas: normalización al guardar datos nuevos + compatibilidad hacia atrás al leer datos ya cargados.

Plan de implementación

1. Auditar y centralizar la detección de fecha
- Crear una única utilidad compartida para obtener la fecha real de una fila con este orden:
  1) campo semántico normalizado (`fecha`, `mes`, `date`)
  2) aliases históricos (`__EMPTY`, `unnamed`, `Unnamed: 0`, etc.)
  3) fallback por cualquier valor ISO o `Date`
- Usarla en vez de `findString(... FIELD_DATE, mappedDate)` en los lugares donde hoy todavía falla según el row real.

2. Normalizar filas nuevas en el procesamiento
- En `supabase/functions/process-file/index.ts`, agregar el mapa semántico y la normalización de cada fila antes de guardarla.
- Aplicar esa normalización en el punto común de storage de lotes, para cubrir tanto el flujo tabular principal como los batches client-side ya existentes.
- Mantener `columns` originales para trazabilidad, pero guardar `data` ya normalizada para que nuevas cargas usen claves semánticas estables (`fecha`, `monto`, etc.).

3. Mantener compatibilidad con datos históricos
- Ajustar `src/lib/field-utils.ts` para que `FIELD_*` prioricen nombres normalizados y conserven fallbacks históricos.
- No depender solo de eso: además usar la nueva utilidad de fecha en filtros, agregaciones y extracción de meses, porque hoy el problema aparece cuando el `mapping.date` apunta a otra columna distinta a la del row filtrado.

4. Corregir los consumidores frontend que hoy usan lectura frágil
- `src/lib/data-cleaning.ts`: aplicar la utilidad compartida en `filterByPeriod`, `extractAvailableMonths`, `aggregateBy...` equivalentes si siguen leyendo directo por mapping.
- `src/hooks/useExtractedData.tsx`: usar la misma detección robusta para `availableMonths` y `duplicatedPeriods`.
- `src/pages/Ventas.tsx`: reemplazar los puntos que todavía usan `findString` directo para fecha en filtro, tabla e histogramas.
- Revisar y aplicar el mismo patrón en módulos que hoy consumen fechas de ventas/gastos: `Dashboard`, `Finanzas`, `Metricas`, `Operaciones`, `Stock` y `Forecast`/`forecast-engine`.
- Nota: no existe `src/pages/Gastos.tsx` en el código actual, así que el alcance real es sobre los módulos listados arriba.

5. Validación funcional
- Verificar que el libro de ventas nuevo y los datos históricos convivan:
  - `Ventas` muestre total distinto de 0 con las 274 filas.
  - aparezca `Abr 26` en períodos.
  - al elegir `2026` o `Abr 26`, el gráfico tome las transacciones del libro.
  - el historial 2023–2025 siga visible y filtrable.
- Si hiciera falta, reprocesar solo archivos nuevos/subidos nuevamente para aprovechar la normalización backend; los históricos deberían seguir funcionando por compatibilidad frontend.

Detalles técnicos
- Hallazgos actuales:
  - `Ventas.tsx` ya tiene un `findDateRaw` local, pero `filterByPeriod` sigue recibiendo un callback que usa `findString` sin fallback.
  - `useExtractedData`, `Dashboard`, `Finanzas`, `Metricas`, `Stock` y `forecast-engine` todavía dependen en varios puntos de `findString(... FIELD_DATE, mappedDate)`.
  - `process-file` hoy guarda `extracted_json: { columns, data: rows }` sin normalización semántica de cada fila.
- Diseño recomendado:
  - mover la detección robusta de fecha a una utilidad compartida en `src/lib/field-utils.ts` o `src/lib/data-cleaning.ts` para no duplicarla.
  - aplicar la normalización en `storeRowBatch(...)`, porque es el punto común donde terminan persistiéndose los lotes.
- Alcance:
  - no requiere cambios de base de datos, RLS ni auth.
  - no hace falta migrar datos viejos si el frontend queda backward-compatible.

Resultado esperado
- Nuevas cargas: filas persistidas con claves semánticas consistentes.
- Datos viejos: siguen funcionando aunque tengan `__EMPTY`/`Unnamed`.
- Filtros, pills de período, cards y gráficos dejan de depender de un único `mapping.date` que puede no coincidir con la estructura real del row.
