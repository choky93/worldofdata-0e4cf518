

# Fase 3 — Copiloto AI con contexto de datos del negocio

## Problema actual
El copiloto AI (`ai-chat`) usa OpenAI directamente con una API key propia, sin contexto del negocio. El usuario pregunta "¿cómo van mis ventas?" y la IA no tiene datos reales para responder. Además, la función `ai-search` (Perplexity) existe pero no está integrada en la UI.

## Solución

### Paso 1: Migrar `ai-chat` a Lovable AI Gateway
Reemplazar la llamada directa a OpenAI por el gateway de Lovable AI (`https://ai.gateway.lovable.dev/v1/chat/completions`) usando `LOVABLE_API_KEY`. Esto elimina la dependencia de `OPENAI_API_KEY` para el chat.

**Archivo:** `supabase/functions/ai-chat/index.ts`

### Paso 2: Inyectar contexto del negocio en el copiloto
Modificar `ai-chat` para que reciba un parámetro `context` opcional desde el frontend. El edge function construirá un system prompt enriquecido con datos del negocio (nombre de empresa, industria, settings, archivos subidos, etc.).

En el frontend (`AICopilot.tsx`), enviar el contexto del negocio (de `useAuth`) junto con los mensajes: nombre de empresa, si vende productos/servicios, si tiene stock, si usa ads, etc.

### Paso 3: Agregar botón de investigación de mercado (Perplexity)
Agregar un modo "Investigar" al copiloto que usa la función `ai-search` existente para consultas de mercado/industria. Se muestra como un toggle o botón en el input del chat.

### Paso 4: Pasar datos reales al system prompt
Crear un endpoint o lógica en el edge function que consulte la DB (usando `SUPABASE_SERVICE_ROLE_KEY`) para obtener un resumen de los datos del negocio: últimos archivos subidos, configuración, diagnóstico. Esto se inyecta en el system prompt para que la IA responda con contexto real.

---

## Detalle técnico

### `ai-chat/index.ts` (reescribir)
- Usar `LOVABLE_API_KEY` + gateway URL
- Aceptar `{ messages, context?, mode? }` 
- Si `mode === 'search'`: redirigir a Perplexity vía `ai-search` internamente
- Consultar DB con service role para obtener resumen de empresa
- Modelo: `google/gemini-2.5-flash` (buen balance costo/calidad)
- Manejar errores 429/402

### `AICopilot.tsx` (modificar)
- Enviar `context` con datos del `useAuth()` (companyName, companySettings, etc.)
- Agregar toggle "Investigar mercado" que cambia `mode` a `search`
- Mostrar citaciones cuando la respuesta viene de Perplexity

## Archivos tocados
- `supabase/functions/ai-chat/index.ts` (reescribir)
- `src/components/AICopilot.tsx` (agregar contexto + modo investigación)

