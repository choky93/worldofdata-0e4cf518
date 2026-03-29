

# Migración: Agregar `next_chunk_index` a `file_uploads`

## Qué se hace

Una migración SQL que agrega la columna `next_chunk_index` (integer, default 0) a la tabla `file_uploads`. Esta columna permite que el worker de procesamiento retome archivos grandes desde el chunk correcto en lugar de reiniciar desde cero.

## SQL

```sql
ALTER TABLE public.file_uploads ADD COLUMN IF NOT EXISTS next_chunk_index integer DEFAULT 0;
```

## Por qué es necesario

Sin esta columna, `process-queue` no puede pasar el `startChunk` correcto a `process-file`, causando reprocesamiento infinito de los mismos chunks y duplicación de datos.

