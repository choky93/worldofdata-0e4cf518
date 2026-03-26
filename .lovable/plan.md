
# Procesamiento inteligente de archivos — IMPLEMENTADO ✅

## Qué se construyó

Pipeline automático de extracción de datos: cuando un usuario sube un archivo, el sistema lo descarga de R2, extrae el contenido según el formato, lo envía a OpenAI para clasificación/estructuración, y guarda los datos extraídos en `file_extracted_data`.

## Archivos tocados
1. **Migración SQL** — tabla `file_extracted_data` + columna `processing_error` en `file_uploads` + RLS + política UPDATE
2. **`supabase/functions/process-file/index.ts`** — nuevo edge function (CSV, Excel, PDF, Word, imágenes, XML)
3. **`src/pages/CargaDatos.tsx`** — status vuelve a 'processing', trigger automático a process-file, más formatos aceptados
4. **`supabase/functions/ai-chat/index.ts`** — contexto del copiloto incluye datos extraídos
