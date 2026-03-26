

# Etapa 3 — Importación externa, procesamiento paralelo y prioridades

## Análisis de viabilidad

La Etapa 3 original planteaba tres cosas:
1. **Importación desde Google Drive / ERPs** — No hay conector de Google Drive disponible en el workspace, y los conectores de ERP (SAP, Odoo) no existen como conectores nativos. Implementar esto requeriría que el usuario configure OAuth con Google manualmente o traiga sus propias API keys de ERP. Es viable pero con setup manual.
2. **Procesamiento paralelo masivo** — Hoy `process-queue` procesa archivos secuencialmente (uno tras otro). Se puede mejorar para procesar varios en paralelo dentro de la misma invocación.
3. **Sistema de prioridades** — Agregar un campo `priority` a `file_uploads` para que ciertos archivos se procesen antes.

## Lo que se puede implementar ahora

### A. Importación por URL (Google Drive, Dropbox, enlaces directos)

En vez de depender de un conector OAuth complejo, implementar un flujo más simple:
- El usuario pega una URL pública o compartida (Google Drive link, Dropbox link, URL directa a archivo)
- Una edge function `import-url` descarga el archivo, lo sube a R2, y lo registra en `file_uploads`
- Esto cubre el caso más común: "tengo un link de Drive compartido"

### B. Procesamiento paralelo en `process-queue`

- Cambiar `process-queue` para lanzar hasta 3 archivos en paralelo usando `Promise.allSettled`
- Hoy procesa 5 secuencialmente → cambiarlo a 5 en paralelo
- Reduce el tiempo total de cola significativamente

### C. Sistema de prioridades

- Agregar columna `priority` (integer, default 0) a `file_uploads` — valores más altos = más prioridad
- `process-queue` ordena por `priority DESC, created_at ASC`
- UI: botón "Priorizar" en archivos en cola que sube la prioridad
- Archivos subidos manualmente tienen prioridad normal (0), importaciones masivas tienen prioridad baja (-1)

### D. Importación masiva por CSV de URLs

- El usuario sube un CSV con columnas `url, nombre` (o similar)
- El sistema descarga cada URL y la procesa como archivo normal
- Útil para empresas que tienen datos en múltiples fuentes

## Archivos a crear/modificar

1. **`supabase/functions/import-url/index.ts`** (nuevo) — descarga archivo desde URL, sube a R2, registra en DB
2. **`supabase/functions/process-queue/index.ts`** — procesamiento paralelo con `Promise.allSettled`
3. **`src/pages/CargaDatos.tsx`** — UI para importar por URL, botón de priorizar, indicador de prioridad
4. **Migración SQL** — agregar columna `priority` a `file_uploads`

## Detalle técnico

```text
IMPORTACIÓN POR URL:
  Usuario pega URL → import-url descarga archivo
       ↓
  Sube a R2 → registra en file_uploads (status: "queued")
       ↓
  process-queue lo toma normalmente

PROCESAMIENTO PARALELO:
  process-queue toma 5 archivos
       ↓
  Promise.allSettled([process(1), process(2), process(3), ...])
       ↓
  Todos se procesan al mismo tiempo → 3-5x más rápido

PRIORIDADES:
  file_uploads.priority: 1 (alta), 0 (normal), -1 (baja)
       ↓
  process-queue: ORDER BY priority DESC, created_at ASC
       ↓
  Archivos prioritarios se procesan primero
```

## Qué queda fuera (requiere setup del usuario)

- **Google Drive OAuth directo**: necesitaría que el usuario configure un proyecto en Google Cloud Console. Se puede agregar después si hay demanda.
- **APIs de ERPs**: cada ERP tiene su propia API. Se implementaría caso por caso según qué ERP use cada cliente.
- Ambos son extensiones naturales del sistema de importación por URL.

