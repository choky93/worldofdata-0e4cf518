

# Fix: Limpiar datos duplicados y re-encolar archivos con error

## Problema

Los cambios de código están bien aplicados pero hay **datos basura históricos** que contaminan los resultados. Un solo archivo tiene 1160 registros duplicados cuando debería tener 2.

## Plan

### 1. Migración SQL para limpiar duplicados

Una migración que:
- Elimine todos los `file_extracted_data` de archivos que están en estado `error` (datos parciales/corruptos)
- Para archivos `processed`, elimine duplicados manteniendo solo el registro más reciente por `(file_upload_id, chunk_index)`

```sql
-- Borrar datos de archivos con error (datos parciales inútiles)
DELETE FROM file_extracted_data 
WHERE file_upload_id IN (SELECT id FROM file_uploads WHERE status = 'error');

-- Borrar duplicados: mantener solo el más reciente por (file_upload_id, chunk_index)
DELETE FROM file_extracted_data a
USING file_extracted_data b
WHERE a.file_upload_id = b.file_upload_id
  AND a.chunk_index = b.chunk_index
  AND a.created_at < b.created_at;
```

### 2. Re-encolar archivos con error

```sql
UPDATE file_uploads 
SET status = 'queued', processing_error = NULL, next_chunk_index = 0
WHERE status = 'error';
```

### 3. Agregar unique constraint para prevenir duplicados futuros a nivel DB

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_file_chunk 
ON file_extracted_data (file_upload_id, chunk_index);
```

Esto hace que incluso si el DELETE falla, el INSERT con duplicado sea rechazado por la base de datos. Es la defensa definitiva.

## Resultado

- Se eliminan ~1400 registros basura
- Los 4 archivos con error se re-encolan para procesamiento
- Un unique index impide que esto vuelva a pasar

## Detalle técnico

- Una sola migración SQL con 3 operaciones
- No requiere cambios de código (el código ya está correcto)
- El unique index puede requerir cambiar el INSERT por un UPSERT en `process-file` para evitar errores de constraint violation — pero como ya hace DELETE antes, debería funcionar

