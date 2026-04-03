

# Auditoría completa: Pipeline de subida de archivos

## Diagnóstico raíz confirmado

El problema es que **la edge function `process-file` no se desplegó correctamente con el fix de chunk_index negativos**, o el fix tiene un bug sutil. La evidencia:

1. Los logs muestran que `process-file` devuelve HTTP 200 para ambos archivos
2. La clasificación AI funciona (`AI classification for "Informe ventas mensuales .xls"`)
3. Los rows se limpian (`26 → 26 rows after cleaning`)
4. Pero `file_extracted_data` queda vacío (la query del frontend devuelve `[]`)
5. El health check detecta: `"se guardaron 0 de 26 filas"`

**El constraint `UNIQUE INDEX idx_unique_file_chunk ON (file_upload_id, chunk_index)` sigue causando conflictos silenciosos** porque ninguna operación de INSERT en `process-file` verifica el resultado del insert. Los errores se tragan completamente.

## Problemas encontrados (línea por línea)

### 1. Inserts sin verificación de error (CRÍTICO)
`process-file/index.ts` lineas 662-668, 675-681, 479-487: todos los `.insert()` ignoran el resultado. Si el constraint falla, el código continúa como si todo estuviera bien.

### 2. storeRowBatch usa DELETE condicional que puede fallar
Linea 473-477: el DELETE usa `.not('data_category', 'in', '("_column_mapping","_classification")')` — pero si metadata ya existe con el mismo chunk_index, el insert posterior falla y nadie lo sabe.

### 3. processTabularData (PATH C) borra TODO y reinserta
Linea 512: `await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId)` — esto borra la metadata que se acaba de insertar en la linea 514-521.

### 4. Despliegue no verificado
No hay log de "Classification: category=ventas" (que está en `processTabularData`, linea 503) ni de chunk_index values. Sin logs que confirmen que la versión desplegada es la correcta.

### 5. Fechas Excel pueden seguir como seriales
`cleanParsedRows` en el cliente convierte seriales, pero solo si los headers matchean keywords. Si la columna se llama "Mes" (no "fecha"), podría no convertir.

## Plan de implementación

### Archivo: `supabase/functions/process-file/index.ts`

1. **Agregar verificación de error a TODOS los inserts**
   - Después de cada `.insert()`, verificar `{ error }` y loguear/lanzar si falla
   - Aplicar a: metadata _classification (linea 662), _column_mapping (linea 675), storeRowBatch (linea 479), y todos los inserts de PATH B/C

2. **Usar UPSERT en vez de DELETE+INSERT para metadata**
   - Reemplazar el patrón delete-then-insert por `.upsert()` con `onConflict: 'file_upload_id,chunk_index'`
   - Esto elimina la ventana de race condition y simplifica el código

3. **Corregir PATH C (processTabularData)**
   - Linea 512: el DELETE genérico borra todo incluyendo el _column_mapping que se inserta justo después en linea 514-521. Reordenar: primero borrar datos, luego insertar metadata.

4. **Agregar logs explícitos** para cada operación de DB: "Stored _classification at chunk_index=-2", "Stored batch 0 with 26 rows", etc.

5. **Normalización de fechas robusta**: agregar "mes" a DATE_KW para que `convertSerialDates` detecte la columna "Mes" del archivo de ventas.

### Archivo: `src/pages/CargaDatos.tsx`

6. **Mejorar health check** (lineas 724-735): si `savedTotal === 0`, mostrar un error más claro y sugerir reprocesar.

### Despliegue y verificación

7. **Redesplegar `process-file`** explícitamente y verificar con `curl_edge_functions` que la versión nueva está activa.

8. **Test end-to-end**: subir los archivos de prueba y verificar que `file_extracted_data` tiene datos reales.

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| `supabase/functions/process-file/index.ts` | Upserts, error checking, logs, "mes" en DATE_KW |
| `src/pages/CargaDatos.tsx` | Health check mejorado |

## Resultado esperado

- Cada insert reporta si falló o no
- Los datos se guardan correctamente sin conflictos de constraint
- Los logs muestran exactamente qué pasó en cada paso
- Las fechas "Mes" se normalizan correctamente

