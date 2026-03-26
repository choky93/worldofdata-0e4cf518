# Pipeline de archivos — Estado actual (implementado)

## Cambios realizados

### 1. `supabase/functions/process-file/index.ts` — Reescrito completo

- **Modelo**: GPT-4o con max_tokens 4096
- **MAX_ROWS**: Aumentado de 50 a 500
- **PDF**: Extracción de texto real con `unpdf` (pdfjs-serverless). Fallback a texto parcial + contexto para PDFs escaneados
- **CSV**: Parser RFC 4180 con BOM UTF-8, campos entrecomillados, detección automática de delimitador
- **Imágenes**: Visión GPT-4o hasta 5MB
- **Excel sin preParsedData**: Error explícito pidiendo reproceso desde el cliente
- **Metadata de procesamiento**: Cada archivo registra qué método se usó

### 2. `supabase/functions/process-queue/index.ts` — Worker async (NUEVO)

- Procesa hasta 5 archivos pendientes (status: "queued") por invocación
- Llama a `process-file` internamente para cada archivo
- Activado por pg_cron cada minuto como red de seguridad
- Si un archivo falla, marca como error y sigue con el siguiente

### 3. `supabase/functions/r2-download/index.ts` — Descarga segura

- Descarga archivos de R2 con validación de auth y pertenencia a empresa
- Usado para reproceso de Excel

### 4. `src/pages/CargaDatos.tsx` — Reescrito para escalabilidad

- **Batch upload**: Subida masiva con cola visual y progreso individual
- **Paralelo**: Hasta 4 archivos subiendo simultáneamente
- **Status "queued"**: Los archivos se marcan como "En cola" → process-file se invoca inmediatamente + cron como backup
- **Paginación**: 25 archivos por página con navegación
- **Filtros**: Por estado (procesado, en cola, error, procesando) y por tipo (PDF, CSV, Excel, etc.)
- **Búsqueda**: Por nombre de archivo
- **Polling**: Auto-refresh cada 5s mientras hay archivos en cola o procesando

## Arquitectura de procesamiento

```text
Usuario sube N archivos en paralelo (4 simultáneos)
       ↓
R2 Storage + file_uploads (status: "queued")
       ↓
process-file se invoca inmediatamente para cada archivo
       ↓
Si falla → pg_cron (cada 1 min) → process-queue → reintenta
       ↓
GPT-4o analiza contenido (texto/visión según formato)
       ↓
file_extracted_data + status: "processed"
       ↓
UI se actualiza por polling automático
```

## Estrategia por formato

| Formato | Método | Límite |
|---------|--------|--------|
| CSV/TXT | Texto parseado | 15K chars, 500 filas |
| XML | Texto raw | 15K chars |
| Excel | preParsedData del cliente (SheetJS) | 15K chars, 500 filas |
| PDF (con texto) | unpdf text extraction → texto | 15K chars |
| PDF (escaneado) | Texto parcial + contexto | 15K chars |
| Imágenes | GPT-4o visión base64 | 5MB |
| Word | Texto raw | 15K chars |

## Etapas futuras (no implementadas)

- Chunked processing para archivos >500 filas
- Presigned URLs para archivos >50MB
- Dashboard de estado de cola
- Importación desde Google Drive / ERPs
- Procesamiento paralelo masivo
