

# Corregir datos del cliente: aliases de ventas + reprocesar archivos fallidos

## Problemas confirmados

1. **Ventas muestra $0** porque el código busca `monto/total/amount/valor/importe` pero los datos reales del cliente tienen campos como `ganancia`, `monto_total`, `monto_venta`, `total_mensual_iva_inc`, `precio`
2. **2 archivos en error**: "Informe Ganancia de productos vendidos.xlsx" (WORKER_LIMIT) e "Imforme ganancia de marcas .xls" (504 timeout)
3. **Chunks vacíos**: Algunos bloques de archivos grandes fallaron en la IA y quedaron con 0 filas

## Plan

### 1. Ampliar aliases de campos en Ventas.tsx

Agregar `ganancia`, `monto_total`, `monto_venta`, `total_mensual_iva_inc`, `precio` a la lista de campos que se buscan para calcular el monto. Esto es lo que hace que todo se vea en $0 — es el fix más crítico.

Campos a agregar en el cálculo de `salesTotal` y en `salesHistory`:
- `ganancia` (viene de "productos más vendidos" y "ganancia de marcas")
- `monto_total` / `monto_venta` (viene de "rubro más vendido")
- `total_mensual_iva_inc` (viene de "ventas mensuales")
- `precio` (viene de algunos registros de productos)

También agregar `categoria` como campo extra visible en la tabla.

### 2. Aplicar lo mismo en Dashboard.tsx y Finanzas.tsx

Dashboard y Finanzas también calculan totales de ventas — necesitan los mismos aliases para no mostrar $0.

### 3. Hacer más robusto el procesamiento de archivos grandes

En `process-file/index.ts`:
- Reducir `ROWS_PER_CHUNK` de 1000 a 500 para archivos >1MB (menos presión por invocación de IA)
- Reducir `MAX_CHUNKS_PER_RUN` de 5 a 3 para archivos pesados
- Esto evita el WORKER_LIMIT y los 504 que matan los archivos de 33K filas

### 4. Agregar botón "Reintentar" para archivos con error

En `CargaDatos.tsx`, para archivos en estado `error`, mostrar un botón que resetee el archivo a `queued` para que el worker lo vuelva a intentar con los nuevos límites más conservadores.

## Archivos a modificar

- `src/pages/Ventas.tsx` — aliases de campos
- `src/pages/Dashboard.tsx` — aliases de campos
- `src/pages/Finanzas.tsx` — aliases de campos
- `supabase/functions/process-file/index.ts` — chunks más chicos para archivos pesados
- `src/pages/CargaDatos.tsx` — botón reintentar

## Resultado esperado

- Ventas deja de mostrar $0 y refleja los ~$37.9M de ganancia real del cliente
- Los 2 archivos fallidos se pueden reintentar y van a procesar sin explotar
- Dashboard y Finanzas también muestran las métricas correctas

