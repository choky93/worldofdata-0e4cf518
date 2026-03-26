

# Fix: process-file falla por límites de CPU, memoria y JSON roto

## Problemas encontrados en los logs

1. **CPU Time exceeded**: `XLSX.read()` + `JSON.stringify(rows, null, 2)` con pretty-print de 100 filas consume todo el CPU disponible en Edge Functions
2. **Memory limit exceeded**: descargar archivos completos + parsear + convertir a base64 en memoria simultáneamente
3. **JSON parse error en línea 136**: OpenAI devuelve JSON inválido y `JSON.parse()` explota sin retry ni fallback

## Cambios en `supabase/functions/process-file/index.ts`

### A. Reducir carga de CPU y memoria
- Limitar a **30 filas** en vez de 100 para el contenido enviado a OpenAI
- Usar `JSON.stringify()` **sin pretty-print** (sin `null, 2`) — ahorra CPU significativamente
- Truncar contenido a **8,000 caracteres** en vez de 30,000
- Usar `gpt-4o-mini` en vez de `gpt-4o` — más rápido, menos tokens, suficiente para clasificar datos tabulares
- Reducir `max_tokens` de 4096 a 2048

### B. Manejar JSON roto de OpenAI
- Envolver `JSON.parse()` en try/catch
- Si falla, intentar limpiar el string (remover trailing commas, truncar en último `}` válido)
- Si sigue fallando, devolver un resultado genérico con category "otro" en vez de crashear

### C. Optimizar conversión de imágenes a base64
- El loop `String.fromCharCode` byte a byte (líneas 199-203) es extremadamente lento para archivos grandes
- Limitar imágenes a 500KB para base64, rechazar las más grandes con un fallback de texto

### D. Eliminar código muerto del PDF
- Las líneas 206-216 convierten PDF a base64 y luego lo descartan (`isImage = false`). Eliminar esa conversión inútil que gasta CPU y memoria

## Archivo tocado

Solo `supabase/functions/process-file/index.ts`

## Resultado esperado

Los archivos de <1MB (Excel, CSV) deberían procesarse en segundos sin exceder límites de CPU/memoria. Los errores de JSON ya no van a dejar archivos trabados en "Procesando".

