

# Fase 1 — Implementación

## Paso 1: Configurar los 6 secrets

Usar la herramienta `add_secret` para pedir al usuario que ingrese cada valor:

1. `OPENAI_API_KEY`
2. `PERPLEXITY_API_KEY`
3. `CLOUDFLARE_R2_ACCESS_KEY_ID`
4. `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
5. `CLOUDFLARE_R2_ENDPOINT` (ej: `https://65ea67427a4b20ab345474a27b66d128.r2.cloudflarestorage.com`)
6. `CLOUDFLARE_R2_BUCKET_NAME` (ej: `worldofdata-uploads`)

Los secrets quedan disponibles como variables de entorno en las edge functions.

---

## Paso 2: Crear edge function `ai-chat`

**Archivo:** `supabase/functions/ai-chat/index.ts`

- CORS headers estándar
- Recibe `{ messages, systemPrompt? }` del frontend
- Llama a la API de OpenAI (`https://api.openai.com/v1/chat/completions`) con streaming
- Modelo: `gpt-4o` (configurable)
- Devuelve SSE stream al frontend
- Manejo de errores (API key inválida, rate limit, etc.)

## Paso 3: Crear edge function `ai-search`

**Archivo:** `supabase/functions/ai-search/index.ts`

- CORS headers
- Recibe `{ query, context? }`
- Llama a Perplexity API (`https://api.perplexity.ai/chat/completions`) con modelo `sonar-pro`
- Devuelve respuesta + citations
- Sin streaming (respuesta completa)

## Paso 4: Crear edge function `r2-upload`

**Archivo:** `supabase/functions/r2-upload/index.ts`

- CORS headers
- Recibe archivo como FormData (multipart)
- Usa `AwsClient` de `aws4fetch` para firmar request S3 PUT a R2
- Path: `{user_id}/{timestamp}_{filename}`
- Devuelve `{ storagePath, success }`

## Paso 5: Crear edge function `r2-delete`

**Archivo:** `supabase/functions/r2-delete/index.ts`

- CORS headers
- Recibe `{ storagePath }`
- Usa `aws4fetch` para DELETE en R2
- Devuelve `{ success }`

## Paso 6: Migrar CargaDatos.tsx

**Archivo:** `src/pages/CargaDatos.tsx`

Cambios:
- **Upload:** Reemplazar `supabase.storage.from('uploads').upload(...)` por construir FormData y llamar a `supabase.functions.invoke('r2-upload', { body: formData })`
- **Delete:** Reemplazar `supabase.storage.from('uploads').remove(...)` por `supabase.functions.invoke('r2-delete', { body: { storagePath } })`
- La tabla `file_uploads` sigue usándose igual, solo cambia dónde se guarda el archivo físico

---

## Archivos tocados
- `supabase/functions/ai-chat/index.ts` (nuevo)
- `supabase/functions/ai-search/index.ts` (nuevo)
- `supabase/functions/r2-upload/index.ts` (nuevo)
- `supabase/functions/r2-delete/index.ts` (nuevo)
- `src/pages/CargaDatos.tsx` (modificar upload/delete)

