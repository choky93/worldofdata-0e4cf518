
Diagnóstico real del problema

- El archivo de ventas mensual está quedando guardado con la fecha como serial de Excel (`Mes: "45231.0"`) en vez de una fecha normal.
- Después la UI intenta renderizar eso con `new Date(raw)`, y por eso aparecen ejes raros e `Invalid Date`.
- Además, el mapeo de IA no está sobreviviendo: `_classification` y `_column_mapping` se guardan con `chunk_index = 0`, pero luego el guardado del primer lote borra todo lo que tenga ese mismo índice. O sea: el sistema pierde el mapping exacto del archivo.
- Y, encima, el dashboard trata este archivo como si fueran “26 transacciones”, cuando en realidad es una serie mensual agregada de 26 meses.

Plan de implementación

1. Arreglar la normalización de fechas Excel de punta a punta
- `src/lib/data-cleaning.ts`: convertir fechas Excel tanto si vienen como número como si vienen como string numérico (`"45231.0"`).
- `supabase/functions/process-file/index.ts`: aplicar esa misma normalización antes de guardar, para que en base queden fechas reales (por ejemplo `2023-11-01`).

2. Evitar que se borre el mapeo de IA
- `supabase/functions/process-file/index.ts`: separar el guardado de metadata del guardado de lotes reales.
- El batch 0 no debe volver a borrar `_classification` ni `_column_mapping`.

3. Unificar el parseo de fechas en la UI
- `src/lib/formatters.ts`: dejar de depender de `new Date(raw)` directo y usar un parser robusto.
- `src/pages/Dashboard.tsx` y `src/pages/Ventas.tsx`: construir gráficos, etiquetas y tabla usando fechas ya parseadas, no strings crudos.

4. Adaptar la experiencia a archivos mensuales agregados
- `src/pages/Dashboard.tsx`: si el archivo representa meses, mostrar algo como “26 meses cargados” o “Último mes cargado: …” en vez de “26 transacciones”.
- `src/pages/Ventas.tsx`: si el archivo solo tiene período + monto, mostrar una tabla acorde a eso, sin columnas vacías de Cliente y Detalle.
- Priorizar la visualización mensual cuando el origen del archivo sea mensual.

5. Reproceso y validación
- Reprocesar el `.xls` actual con la lógica corregida.
- Verificar:
  - que las fechas se guarden normalizadas,
  - que el mapping de IA quede persistido,
  - que desaparezca `Invalid Date`,
  - que el gráfico muestre meses reales,
  - y que el dashboard use wording correcto para este tipo de archivo.

Archivos a tocar
- `src/lib/data-cleaning.ts`
- `src/lib/formatters.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Ventas.tsx`
- `supabase/functions/process-file/index.ts`
- opcional: `src/pages/CargaDatos.tsx` para usar exactamente la misma limpieza también en reprocesos manuales

Resultado esperado
- Ese Excel simple va a verse como una serie mensual real.
- Las fechas van a aparecer bien en ventas y dashboard.
- El sistema va a conservar el mapping exacto del archivo.
- Y el dashboard va a dejar de comunicar “transacciones” cuando en realidad son meses/períodos.
