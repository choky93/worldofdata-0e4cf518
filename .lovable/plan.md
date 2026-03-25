

# Plan de Integración: OpenAI + Perplexity + Cloudflare R2

## Resumen

Integrar las 3 APIs del cliente en la plataforma World of Data, dividido en **3 fases** para evitar fallos y poder testear cada una antes de avanzar.

---

## FASE 1 — Infraestructura base (secrets + edge functions + R2)

### 1.1 Configurar secrets

Agregar 3 secrets al proyecto usando la herramienta `add_secret`:
- `OPENAI_API_KEY` — API key de OpenAI del cliente
- `PERPLEXITY_API_KEY` — API key de Perplexity del cliente
- `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET_NAME` — credenciales de R2

### 1.2 Edge function: `ai-chat` (OpenAI)

Crear `supabase/functions/ai-chat/index.ts`:
- Recibe mensajes del frontend, los envía a la API de OpenAI (GPT-4o o modelo que el cliente prefiera)
- Soporta streaming SSE para respuestas en tiempo real
- System prompt configurable según el contexto (copiloto de negocios, análisis de datos, etc.)
- Manejo de errores 429/402 con mensajes claros

### 1.3 Edge function: `ai-search` (Perplexity)

Crear `supabase/functions/ai-search/index.ts`:
- Usa Perplexity API (modelo `sonar-pro`) para búsquedas con fuentes
- Recibe una query y contexto del negocio, devuelve respuesta + citations
- Útil para investigación de mercado, benchmarks, tendencias del sector

### 1.4 Edge function: `r2-upload` (Cloudflare R2)

Crear `supabase/functions/r2-upload/index.ts`:
- Recibe archivos del frontend vía multipart o base64
- Sube a Cloudflare R2 usando la API S3-compatible (aws4fetch en Deno)
- Devuelve el path/key del archivo almacenado
- Registra el archivo en la tabla `file_uploads` con el storage_path apuntando a R2

### 1.5 Edge function: `r2-delete`

Crear `supabase/functions/r2-delete/index.ts`:
- Elimina archivos de R2 por key
- Se llama cuando el usuario borra un archivo desde la UI

### 1.6 Migrar CargaDatos.tsx

- Cambiar `supabase.storage.from('uploads').upload(...)` por llamada a `supabase.functions.invoke('r2-upload', ...)`
- Cambiar el delete para usar `supabase.functions.invoke('r2-delete', ...)`
- La tabla `file_uploads` sigue igual, solo cambia el destino del archivo físico

**Archivos a crear/modificar:**
- `supabase/functions/ai-chat/index.ts` (nuevo)
- `supabase/functions/ai-search/index.ts` (nuevo)
- `supabase/functions/r2-upload/index.ts` (nuevo)
- `supabase/functions/r2-delete/index.ts` (nuevo)
- `src/pages/CargaDatos.tsx` (modificar upload/delete)

---

## FASE 2 — Copiloto IA funcional

### 2.1 Activar el AICopilot

Transformar `src/components/AICopilot.tsx` de placeholder a chat funcional:
- Input habilitado, envía mensajes al edge function `ai-chat`
- Streaming token-por-token con rendering markdown (`react-markdown`)
- Historial de conversación en memoria (no persistido por ahora)
- System prompt que incluye contexto del negocio: industria, configuración del onboarding, módulos activos
- Las sugerencias placeholder se vuelven clickeables y envían el mensaje

### 2.2 Botón "Investigar" con Perplexity

Agregar al copiloto un modo "Investigar" que usa Perplexity en vez de OpenAI:
- Cuando el usuario quiere datos de mercado, tendencias, o info externa
- Muestra las fuentes/citations debajo de la respuesta
- Toggle simple entre modo "Analizar" (OpenAI) y "Investigar" (Perplexity)

**Archivos a crear/modificar:**
- `src/components/AICopilot.tsx` (refactor completo)
- `src/lib/ai-client.ts` (nuevo — helper para llamar a las edge functions de IA)

---

## FASE 3 — Funciones IA en módulos

### 3.1 Análisis inteligente de archivos

Crear `supabase/functions/ai-analyze-file/index.ts`:
- Cuando se sube un CSV/XLS, el backend lo lee desde R2, extrae las primeras filas, y le pide a OpenAI que identifique qué tipo de datos son (ventas, stock, gastos, etc.)
- Actualiza el status del archivo a "processed" con metadata del análisis
- En `CargaDatos.tsx`, mostrar un badge con el tipo detectado y un resumen breve

### 3.2 Alertas inteligentes

En `src/pages/Alertas.tsx`:
- Reemplazar mock data por un edge function `ai-alerts` que analiza datos reales y genera alertas con OpenAI
- Ejemplo: "Tu cliente X no compra hace 45 días", "El producto Y tiene stock para solo 3 días"

### 3.3 Forecast con IA

En `src/pages/Forecast.tsx`:
- Crear edge function `ai-forecast` que toma datos históricos de ventas y usa OpenAI para generar predicciones + explicación en lenguaje natural
- Mantener los gráficos actuales pero alimentados con datos reales procesados por IA

### 3.4 Resumen ejecutivo en Dashboard

En `src/pages/Dashboard.tsx`:
- Agregar un card "Resumen del día" generado por OpenAI
- Toma los KPIs actuales y genera 3-4 bullets de lo más relevante
- Se genera una vez al cargar y se cachea en sessionStorage

**Archivos a crear/modificar:**
- `supabase/functions/ai-analyze-file/index.ts` (nuevo)
- `supabase/functions/ai-alerts/index.ts` (nuevo)
- `supabase/functions/ai-forecast/index.ts` (nuevo)
- `src/pages/CargaDatos.tsx` (agregar análisis post-upload)
- `src/pages/Alertas.tsx` (conectar a IA)
- `src/pages/Forecast.tsx` (conectar a IA)
- `src/pages/Dashboard.tsx` (agregar resumen IA)

---

## Detalle técnico

### OpenAI — se usa para:
- Copiloto conversacional (chat streaming)
- Análisis de archivos subidos (clasificación + resumen)
- Generación de alertas inteligentes
- Forecast con explicación
- Resumen ejecutivo del dashboard

### Perplexity — se usa para:
- Búsquedas de mercado con fuentes verificables
- Benchmarks del sector (ej: "¿cuál es el margen promedio en mi industria?")
- Tendencias y noticias relevantes al rubro del cliente

### Cloudflare R2 — se usa para:
- Todo almacenamiento de archivos (reemplaza Supabase Storage)
- Compatible con S3 API, se accede desde edge functions con `aws4fetch`
- Los archivos se registran en la tabla `file_uploads` existente

### Orden de implementación
1. **Fase 1 primero** — sin esto nada funciona. Se testea subiendo un archivo a R2 y haciendo una pregunta al copiloto.
2. **Fase 2 segundo** — el copiloto es la feature más visible y valiosa.
3. **Fase 3 tercero** — funciones avanzadas que dependen de tener datos reales.

### Dependencias npm a agregar
- `react-markdown` (para renderizar respuestas del copiloto)
- `remark-gfm` (soporte de tablas/listas en markdown)

