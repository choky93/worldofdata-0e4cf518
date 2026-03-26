# Pipeline de archivos — Estado actual

## Etapa 1 (implementada)
- Batch upload con cola paralela (4 simultáneos)
- Procesamiento async con pg_cron como backup
- Paginación, filtros, búsqueda
- MAX_ROWS 500, polling cada 5s

## Etapa 2 (implementada)

### E. Chunked processing
- CSV/Excel >500 filas: se divide en bloques de 500, cada bloque se procesa con GPT-4o
- PDF con texto >15K chars: se divide en chunks de ~12K chars
- Cada chunk genera un registro en `file_extracted_data` con `chunk_index`
- Sin límite práctico de tamaño de archivo

### F. Presigned URLs
- Archivos >20MB: subida directa a R2 via presigned URL (edge function `r2-presign`)
- Archivos <=20MB: flujo normal via `r2-upload`
- Límite de subida: 100MB por archivo

### G. Dashboard de estado
- Barra de resumen: procesados, en cola, procesando, errores
- Botón "Cancelar" para archivos en cola
- Indicador de chunks procesados por archivo
- Soporte de estado "cancelled"

## Arquitectura de procesamiento

```text
Usuario sube N archivos en paralelo (4 simultáneos)
       ↓
  >20MB → r2-presign → PUT directo a R2
  <=20MB → r2-upload → R2
       ↓
file_uploads (status: "queued")
       ↓
process-file se invoca inmediatamente
       ↓
Si archivo grande:
  CSV 10K filas → chunk 1 (0-500) → GPT-4o → file_extracted_data (chunk_index=0)
               → chunk 2 (501-1000) → GPT-4o → file_extracted_data (chunk_index=1)
               → ...
  PDF texto largo → chunks de 12K chars → GPT-4o → file_extracted_data por chunk
       ↓
Si archivo chico:
  Procesamiento normal → 1 registro en file_extracted_data (chunk_index=0)
       ↓
status: "processed" → UI se actualiza por polling
```

## Etapa 3 (no implementada)
- Importación desde Google Drive / ERPs
- Procesamiento paralelo masivo
- Sistema de prioridades
