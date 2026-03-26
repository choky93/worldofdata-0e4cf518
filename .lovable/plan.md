

# Corregir ai-chat: usar OpenAI del cliente en vez de Lovable AI Gateway

## Problema
El edge function `ai-chat` está usando el Lovable AI Gateway con `LOVABLE_API_KEY`, lo que te cobra a vos (desarrollador). El cliente ya tiene su propia `OPENAI_API_KEY` configurada como secret y la intención siempre fue que los costos de IA los pague el cliente.

## Cambios en `supabase/functions/ai-chat/index.ts`

1. **Reemplazar el gateway URL** por la API directa de OpenAI: `https://api.openai.com/v1/chat/completions`
2. **Usar `OPENAI_API_KEY`** en vez de `LOVABLE_API_KEY` para autenticación
3. **Cambiar el modelo** a `gpt-4o` (o `gpt-4o-mini` si se prefiere menor costo) — modelos actuales de OpenAI
4. **Mantener todo lo demás igual**: contexto de negocio, streaming SSE, modo search (Perplexity), manejo de errores

## Detalle técnico

- Línea 10: `GATEWAY_URL` → `https://api.openai.com/v1/chat/completions`
- Líneas 62-68: Leer `OPENAI_API_KEY` en vez de `LOVABLE_API_KEY`
- Línea 146: Modelo → `gpt-4o` (o el que el cliente prefiera)
- El resto del código (fetchCompanyContext, modo search con Perplexity, streaming) no cambia

## Archivos tocados
- `supabase/functions/ai-chat/index.ts` (solo este archivo)

