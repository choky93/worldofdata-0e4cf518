
# Procesamiento inteligente de archivos — IMPLEMENTADO ✅

## Qué se construyó

Pipeline automático de extracción de datos: cuando un usuario sube un archivo, el sistema lo descarga de R2, extrae el contenido según el formato, lo envía a OpenAI para clasificación/estructuración, y guarda los datos extraídos en `file_extracted_data`.

## Archivos tocados
1. **Migración SQL** — tabla `file_extracted_data` + columna `processing_error` en `file_uploads` + RLS + política UPDATE
2. **`supabase/functions/process-file/index.ts`** — nuevo edge function (CSV, Excel, PDF, Word, imágenes, XML)
3. **`src/pages/CargaDatos.tsx`** — status vuelve a 'processing', trigger automático a process-file, más formatos aceptados
4. **`supabase/functions/ai-chat/index.ts`** — contexto del copiloto incluye datos extraídos

# Mejora del Copiloto IA — IMPLEMENTADO ✅

## Qué se cambió

1. **Datos reales en contexto** — el copiloto ahora recibe el `extracted_json` completo (no solo resúmenes), hasta 30K caracteres
2. **System prompt reescrito** — persona de analista interno, no enciclopedia. Reglas: dar conclusiones con números, no listas de pasos
3. **Perplexity híbrido en chat** — cuando detecta keywords de mercado/competencia/tendencias, busca contexto real en Perplexity antes de responder
4. **Tono argentino** — conversacional, directo, con vos/tuteo
5. **Sugerencias actualizadas** — preguntas más enfocadas en análisis concreto
