

# Etapa 2 — Chunked processing, presigned URLs y dashboard de cola

## Alcance

Tres mejoras principales:

### E. Procesamiento por chunks para archivos grandes

**Problema**: Archivos con miles de filas o PDFs de muchas páginas se truncan a 500 filas / 15K chars. El resto se pierde.

**Solución en `process-file/index.ts`**:
- CSV/Excel con >500 filas: dividir en bloques de 500 filas, procesar cada bloque con GPT-4o por separado, insertar cada bloque como un registro en `file_extracted_data` con un campo `chunk_index`
- PDFs con muchas páginas: `unpdf` ya extrae todo el texto; si el texto excede 15K chars, dividirlo en chunks de ~12K chars y enviar cada uno a GPT-4o
- Cada chunk genera su propio registro en `file_extracted_data`, todos con el mismo `file_upload_id`
- El resumen final combina los parciales

**Cambio en base de datos**: agregar columna `chunk_index` (integer, default 0) a `file_extracted_data` para distinguir chunks del mismo archivo.

### F. Presigned URLs para archivos >50MB

**Problema**: El edge function `r2-upload` recibe el archivo completo en memoria. Con archivos de 50MB+ puede hacer timeout o fallar.

**Solución**: Crear un nuevo edge function `r2-presign` que:
1. Recibe nombre de archivo y tamaño
2. Genera una presigned PUT URL directa a R2 usando aws4fetch
3. El browser sube directo a R2 sin pasar por el edge function
4. Después el frontend registra el archivo en `file_uploads`

**Cambios en `CargaDatos.tsx`**: Para archivos >20MB, usar presigned URL en vez de `r2-upload`. Para <=20MB, mantener el flujo actual.

**Límite de subida en UI**: Subir de 20MB a 100MB el máximo permitido.

### G. Dashboard de estado de procesamiento

**Mejoras en `CargaDatos.tsx`**:
- Barra de resumen arriba de la lista: contadores de "X procesados, Y en cola, Z con error"
- Indicador de procesamiento activo con estimación básica
- Botón "Cancelar procesamiento" que cambia status a "cancelled" para archivos en cola
- Expandir el detalle de cada archivo para ver metadata de procesamiento (método usado, chunks procesados, etc.)

## Archivos a modificar/crear

1. **`supabase/functions/process-file/index.ts`** — lógica de chunking para CSV, Excel y PDF
2. **`supabase/functions/r2-presign/index.ts`** (nuevo) — genera presigned URLs para subida directa
3. **`src/pages/CargaDatos.tsx`** — presigned upload para archivos grandes, dashboard de estado, soporte visual para chunks
4. **Migración SQL** — agregar `chunk_index` a `file_extracted_data`

## Detalle técnico

```text
CHUNKED PROCESSING:
  CSV 10K filas → chunk 1 (filas 1-500) → GPT-4o → file_extracted_data (chunk_index=0)
                → chunk 2 (filas 501-1000) → GPT-4o → file_extracted_data (chunk_index=1)
                → ...hasta chunk N

  PDF 50 páginas → texto total 80K chars
                 → chunk 1 (0-12K) → GPT-4o → file_extracted_data (chunk_index=0)
                 → chunk 2 (12K-24K) → GPT-4o → file_extracted_data (chunk_index=1)
                 → ...

PRESIGNED UPLOAD (archivos >20MB):
  Frontend → r2-presign (genera URL) → Browser PUT directo a R2
           → Frontend inserta file_uploads → process-file
```

