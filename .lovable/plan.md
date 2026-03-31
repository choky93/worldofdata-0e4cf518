

# Plan: Blindar el pipeline de ingesta para cualquier cliente y cualquier archivo

## Diagnóstico real — Todos los flancos abiertos que encontré

Revisé todo el pipeline de punta a punta. Hay **6 problemas concretos** que explican por qué los datos no siempre se reflejan bien y por qué no podés confiar en que "funcione para cualquier cliente":

### 1. CSV no se parsea en el navegador
Los archivos Excel sí se parsean client-side (determinístico, bien). Pero los CSV van directo al servidor sin parseo previo. Si un CSV es grande, pasa por la misma ruta vieja del servidor que puede fallar.

### 2. `fixBrokenHeaders` no se aplica en el servidor
La función que detecta filas de título rotas (`__EMPTY`) solo existe en el frontend. Si un archivo Excel se procesa en el servidor (porque el parseo client-side falló, o porque llega por URL import, o por la cola), **los headers quedan rotos**.

### 3. Límite de 1000 filas en la consulta de datos
`useExtractedData` hace un `SELECT` sin `.limit()`, que en la API de la base de datos tiene un límite por defecto de **1000 registros**. Si un cliente tiene 50 archivos procesados con 3 batches cada uno = 150 chunks, está bien. Pero si tiene muchos archivos, los últimos chunks no se cargan y las métricas quedan incompletas **en silencio**.

### 4. No hay validación de que las filas tengan datos útiles
El sistema guarda filas tal cual vienen de SheetJS. Si una fila tiene todos los valores vacíos (filas en blanco dentro del Excel), se guarda igual. Después `findNumber` devuelve 0 para esas filas y infla los conteos.

### 5. Archivos multi-hoja se mezclan sin control
Si un Excel tiene 3 hojas (ej: "Ventas Enero", "Ventas Febrero", "Resumen"), todas las filas se concatenan en un solo array. El clasificador AI ve solo las primeras 10 filas (de la primera hoja). Si la última hoja tiene estructura distinta, se guarda con headers que no le corresponden.

### 6. La categoría `otro` no se muestra en ningún módulo
Si la IA clasifica mal (o no puede clasificar), los datos quedan en `otro`. Pero ningún módulo (Dashboard, Ventas, Finanzas, etc.) consume la categoría `otro`. Esos datos desaparecen para el usuario sin aviso.

## Soluciones — archivo por archivo

### A. `src/pages/CargaDatos.tsx` — Parseo client-side para CSV + limpieza de filas vacías

**Qué cambia:**
- Parsear CSV en el navegador igual que Excel (usando `Papa Parse` o parseo manual simple)
- Aplicar `fixBrokenHeaders` también a CSV
- Filtrar filas completamente vacías antes de enviar batches
- Mejorar manejo de archivos multi-hoja: procesar cada hoja como archivo independiente si tienen headers distintos

### B. `supabase/functions/process-file/index.ts` — `fixBrokenHeaders` server-side

**Qué cambia:**
- Mover la lógica de `fixBrokenHeaders` al servidor también (para el Path C: archivos procesados server-side)
- Aplicarla a Excel Y CSV procesados en servidor
- Filtrar filas vacías antes de guardar

### C. `src/hooks/useExtractedData.ts` — Paginación completa

**Qué cambia:**
- Usar paginación para traer TODOS los chunks, no solo los primeros 1000
- Loop de `range(0, 999)`, `range(1000, 1999)`, etc. hasta que no haya más
- Esto garantiza que un cliente con cientos de archivos vea todos sus datos

### D. `src/pages/CargaDatos.tsx` — Manejo inteligente de multi-hoja

**Qué cambia:**
- Detectar si las hojas tienen headers diferentes
- Si son diferentes: clasificar y enviar cada hoja por separado (como si fueran archivos distintos pero bajo el mismo `file_upload_id`)
- Si son iguales: concatenar como ahora

### E. Visibilidad de datos sin clasificar

**Qué cambia:**
- Si hay datos en categoría `otro`, mostrar un aviso en Dashboard: "Hay X filas que no pudieron clasificarse automáticamente"
- Agregar una sección en Carga de Datos que muestre qué archivos quedaron como `otro` con opción de reclasificar manualmente

### F. Validación post-ingesta (health check)

**Qué cambia:**
- Después de guardar todos los batches, verificar que la suma de `row_count` de los chunks coincida con el total de filas enviadas
- Si no coincide, marcar como `partial` en vez de `processed`
- Mostrar en la UI cuántas filas se guardaron vs cuántas se esperaban

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| `src/pages/CargaDatos.tsx` | Parseo client-side de CSV, limpieza filas vacías, multi-hoja inteligente |
| `supabase/functions/process-file/index.ts` | `fixBrokenHeaders` server-side, filtrado filas vacías |
| `src/hooks/useExtractedData.ts` | Paginación completa para traer todos los chunks |
| `src/pages/Dashboard.tsx` | Aviso si hay datos en categoría `otro` |

## Resultado esperado

- Un cliente sube 30 archivos mezclados → todos se parsean, clasifican y distribuyen correctamente
- CSV, XLS, XLSX: todos pasan por parseo estructurado (no por IA)
- Headers rotos se corrigen automáticamente en cualquier ruta (client o server)
- Filas vacías no contaminan las métricas
- Multi-hoja se maneja sin perder datos
- Si algo no se pudo clasificar, el usuario lo sabe y puede actuar
- No hay límite silencioso de 1000 chunks que esconda datos

