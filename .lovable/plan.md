

# Resumen del sistema actual + Plan de mejora del Copiloto

## Parte 1: Cómo funciona la Carga de Datos (para que lo tengas claro)

El flujo completo es:

```text
Usuario sube archivo (Excel, CSV, PDF, imagen, etc.)
        │
        ▼
  r2-upload → guarda el archivo en Cloudflare R2
        │
        ▼
  Se inserta registro en file_uploads con status 'processing'
        │
        ▼
  Se dispara process-file en background:
    1. Descarga el archivo desde R2
    2. Lo parsea (SheetJS para Excel, texto para CSV, Vision para imágenes)
    3. Lo manda a OpenAI (gpt-4o) que clasifica (ventas/stock/gastos/etc)
       y estructura los datos en JSON con columnas y filas
    4. Guarda el resultado en file_extracted_data (JSON + resumen + categoría)
    5. Actualiza file_uploads.status a 'processed'
        │
        ▼
  El Copiloto IA puede leer esos datos extraídos cuando el usuario pregunta
```

**¿Está funcional?** Sí, el pipeline completo está implementado y conectado. Los archivos viejos del cliente no tienen datos extraídos porque se subieron antes de que existiera el pipeline. Si los borra y los vuelve a subir, van a pasar por todo el proceso.

---

## Parte 2: Plan de mejora del Copiloto IA

### Problema actual

El system prompt actual dice simplemente: *"Sos un asistente de negocios experto... respondé de forma clara y accionable"*. Esto hace que OpenAI responda como enciclopedia: lista pasos genéricos en vez de analizar los datos que ya tiene.

Además, el contexto que se le pasa al modelo incluye **solo los resúmenes** de los archivos extraídos, no los datos reales (las filas, los números). Sin números concretos, la IA no puede decir "empujá el producto X porque te da 40% de margen".

### Cambios planificados

#### 1. Pasar datos reales al copiloto (no solo resúmenes)

**Archivo:** `supabase/functions/ai-chat/index.ts`

Actualmente `fetchCompanyContext` trae solo `summary` y `row_count` de `file_extracted_data`. Cambiar para que también traiga `extracted_json` (los datos reales: filas de ventas, productos, stock, etc.) y los incluya en el contexto del sistema. Limitar a los últimos 5 archivos y truncar si excede cierto tamaño para no reventar el contexto.

#### 2. Reescribir el system prompt para que sea un analista, no un profesor

**Archivo:** `supabase/functions/ai-chat/index.ts`

El nuevo prompt le va a indicar al modelo:
- "Sos un analista de datos que trabaja dentro de la empresa. Tenés acceso directo a los datos."
- "NUNCA le digas al usuario qué debería analizar. Analizalo vos y dá la respuesta."
- "Usá números concretos de los datos que tenés. Citá cifras, porcentajes, nombres de productos."
- "Si no tenés datos suficientes para responder con certeza, decilo honestamente pero dá tu mejor hipótesis basada en lo que sí tenés."
- "Respondé como un colega que conoce el negocio, no como un manual."
- "Sugerí acciones concretas, no listas de cosas para revisar."

#### 3. Integrar Perplexity en el modo Chat (no solo en "Investigar")

**Archivo:** `supabase/functions/ai-chat/index.ts`

Cuando el copiloto detecte que necesita contexto externo (mercado argentino, tendencias de la industria, datos macro), hacer una llamada previa a Perplexity con el contexto de la industria del cliente para obtener datos de mercado en tiempo real, y luego inyectar esa info como contexto adicional al prompt de OpenAI. Esto permite respuestas como "todas las empresas del sector proyectaron una caída del 10% este mes".

La lógica sería: si la pregunta del usuario menciona temas de mercado, competencia, tendencias o contexto externo, se hace primero un call a Perplexity y se agrega el resultado al system prompt antes de llamar a OpenAI.

#### 4. Mejorar el tono y formato de respuesta

**Archivo:** `supabase/functions/ai-chat/index.ts`

Agregar al system prompt instrucciones de formato:
- Respuestas directas, no más de 3-4 párrafos
- Empezar con la conclusión/respuesta, no con la explicación
- Usar datos específicos del negocio siempre que estén disponibles
- Tono conversacional argentino (vos, tuteo)
- No usar listas largas de pasos a seguir

### Archivos a modificar

1. **`supabase/functions/ai-chat/index.ts`** — system prompt, fetchCompanyContext ampliado, integración Perplexity híbrida
2. **`src/components/AICopilot.tsx`** — (menor) ajustar las sugerencias predeterminadas para que reflejen el nuevo estilo

### Detalle técnico

- El `PERPLEXITY_API_KEY` ya está configurado como secret
- El `OPENAI_API_KEY` ya está configurado
- No se necesitan cambios de base de datos
- No se necesitan nuevas tablas ni migraciones

