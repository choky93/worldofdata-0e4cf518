

# Plan: Corregir la interpretación y visualización de datos ya clasificados

## Diagnóstico real (con datos del cliente en mano)

Los archivos SÍ se clasifican correctamente — el CSV de marketing quedó como `marketing`, el XLS de ventas quedó como `ventas`. El problema NO es la clasificación. Son 3 problemas concretos en cómo se interpretan los datos después de clasificarlos:

### Problema 1: Fechas seriales de Excel
La columna `Mes` del archivo de ventas tiene valor `45231` (número serial de Excel = días desde 1/1/1900). El módulo de Ventas intenta `new Date("45231")` que es inválido → no genera gráficos de evolución mensual ni diaria. Aparece el mensaje "Se necesitan fechas".

### Problema 2: Fila de totales en el CSV de Marketing
La fila 0 del CSV de Meta Ads tiene `Nombre de la campaña: ""` (vacío) con `Importe gastado: 1,909,997.40` que es la SUMA de todas las campañas. Esa fila se incluye en las métricas → el gasto total se DUPLICA. Lo mismo pasa con `Compras: 15` y `Valor de conversión: 12,712,251`.

### Problema 3: Sin filtros de período
Todos los datos se suman juntos sin importar la fecha. El cliente no puede ver "ventas de marzo" vs "ventas de febrero".

## Solución

### A. Conversión automática de fechas seriales de Excel
**Archivo:** `src/pages/CargaDatos.tsx` (en el parseo client-side, antes de enviar batches)

Lógica:
- Detectar columnas con keywords de fecha (`mes`, `fecha`, `date`, `periodo`)
- Si el valor es un número entre 1 y 200000, convertirlo: `new Date((serial - 25569) * 86400000).toISOString().split('T')[0]`
- Aplicar ANTES de enviar a `process-file`

Esto también se aplica en el server-side (`process-file/index.ts`) para archivos procesados por cola.

### B. Filtrado automático de filas de totales/resumen
**Archivo:** `src/pages/CargaDatos.tsx` (post-parseo, pre-envío)

Lógica:
- Si una fila tiene el campo "nombre/campaña/producto" vacío PERO tiene valores numéricos altos, es probablemente un subtotal
- Marcar esas filas con `_is_summary: true` o directamente excluirlas
- Aplicar para marketing (nombre de campaña vacío) y ventas (producto vacío con monto)

### C. Filtros de período en módulos de visualización
**Archivos:** `src/pages/Dashboard.tsx`, `src/pages/Ventas.tsx`, `src/pages/Marketing.tsx`, `src/pages/Finanzas.tsx`

Agregar un selector simple: "Este mes", "Mes pasado", "Últimos 3 meses", "Todo". Filtrar las filas por fecha antes de calcular métricas.

### D. Sistema de cuarentena para archivos dudosos
**Archivos:** `src/pages/CargaDatos.tsx`, `supabase/functions/process-file/index.ts`

Cuando el sistema detecte que no puede interpretar campos clave de un archivo (ej: no encuentra columna de monto, o todas las fechas son inválidas):
- Marcar el archivo como `status: 'review'` en vez de `processed`
- Mostrar en la UI de Carga de Datos una sección "Pendientes de revisión" donde el admin pueda ver las primeras filas y confirmar o reclasificar manualmente

## Detalle técnico

### Conversión de fechas seriales
```text
Ubicación: CargaDatos.tsx → después de fixBrokenHeaders(), antes de enviar batches
Ubicación server: process-file/index.ts → después de fixBrokenHeaders()

Para cada fila:
  Para cada columna cuyo header contenga "fecha"/"mes"/"date"/"periodo":
    Si el valor es número entre 1 y 200000:
      valor = new Date((valor - 25569) * 86400000).toISOString().split('T')[0]
```

### Filtrado de filas resumen
```text
Ubicación: CargaDatos.tsx → después de la conversión de fechas, antes de enviar batches

Para cada fila:
  Buscar campos de "nombre"/"producto"/"campaña" en los headers
  Si TODOS esos campos están vacíos Y hay al menos un campo numérico > 0:
    Excluir la fila (es un subtotal)
```

### Cuarentena
```text
Ubicación: process-file/index.ts → después de clasificar con AI

Verificar:
  - ¿Se encontró al menos 1 campo numérico en los headers? (monto/total/precio/gasto)
  - ¿Hay al menos 1 campo de fecha convertible?
  
Si NO pasa la verificación:
  - Guardar los datos igual (para que no se pierdan)
  - Marcar status = 'review' en file_uploads
  - Agregar processing_error = "Requiere revisión: no se detectaron campos de monto/fecha"
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/CargaDatos.tsx` | Conversión fechas seriales + filtrado filas resumen + UI de cuarentena |
| `supabase/functions/process-file/index.ts` | Conversión fechas seriales server-side + lógica cuarentena |
| `src/pages/Ventas.tsx` | Filtro de período |
| `src/pages/Dashboard.tsx` | Filtro de período |
| `src/pages/Marketing.tsx` | Filtro de período + excluir filas sin nombre de campaña |
| `src/pages/Finanzas.tsx` | Filtro de período |
| Migración SQL | Agregar valor `'review'` como status válido (ya es text libre, no necesita migración) |

## Resultado esperado

- El archivo de ventas con `Mes: 45231` se convierte a `2023-11-01` → los gráficos de evolución funcionan
- La fila de totales del CSV de Meta Ads se excluye → el gasto total no se duplica
- El usuario puede filtrar por período en todos los módulos
- Si un archivo no tiene campos reconocibles, queda en cuarentena para revisión manual en vez de mostrarse con datos incorrectos

