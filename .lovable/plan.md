

# Procesamiento inteligente de archivos subidos

## Qué se va a construir

Cuando un usuario suba un archivo (Excel, CSV, PDF, Word, imagen, XML), el sistema va a **extraer automáticamente la información** usando IA (OpenAI del cliente) y guardarla estructurada en la base de datos. Así el copiloto y los dashboards pueden usar esa data real.

## Arquitectura

```text
Usuario sube archivo
        │
        ▼
  [r2-upload] → guarda en R2 (ya existe)
        │
        ▼
  [CargaDatos.tsx] → inserta en file_uploads con status 'processing'
        │                          │
        ▼                          ▼
  [process-file] ← se llama automáticamente después del upload
        │
        ├─ CSV/Excel → parsea filas directamente (SheetJS)
        ├─ PDF/Word → extrae texto (pdf-parse / mammoth)
        ├─ Imagen → envía a OpenAI Vision para OCR
        ├─ XML → parsea como texto estructurado
        │
        ▼
  OpenAI analiza el contenido y devuelve JSON estructurado
  (tipo de datos detectado, categoría, filas/registros extraídos)
        │
        ▼
  Guarda en tabla file_extracted_data + actualiza status a 'processed'
```

## Cambios en base de datos

### Nueva tabla: `file_extracted_data`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid | PK |
| file_upload_id | uuid | FK a file_uploads |
| company_id | uuid | Para RLS |
| data_category | text | 'ventas', 'gastos', 'stock', 'facturas', 'marketing', 'otro' |
| extracted_json | jsonb | Los datos extraídos estructurados |
| summary | text | Resumen legible de lo que se encontró |
| row_count | integer | Cantidad de registros/filas extraídas |
| created_at | timestamptz | Default now() |

Con RLS: usuarios ven datos de su empresa, admins pueden borrar.

### Agregar columna a `file_uploads`

- `processing_error` (text, nullable): para guardar el mensaje si falla el procesamiento

## Nuevo edge function: `process-file`

1. Recibe `fileUploadId` y `companyId`
2. Descarga el archivo desde R2 usando el `storage_path`
3. Según el tipo de archivo:
   - **CSV**: parsea con lógica simple (split por comas/punto y coma)
   - **Excel (XLS/XLSX)**: usa la librería `SheetJS` (npm:xlsx) para leer hojas y extraer filas
   - **PDF**: usa `npm:pdf-parse` para extraer texto
   - **Word (DOCX)**: extrae el XML interno del docx
   - **Imágenes (PNG/JPG/WEBP)**: envía a OpenAI Vision API como base64
   - **XML**: lee como texto plano
4. Envía el contenido extraído a OpenAI con un prompt que le pide:
   - Clasificar el tipo de datos (ventas, gastos, stock, factura, etc.)
   - Estructurar los datos en JSON con columnas y filas
   - Generar un resumen corto
5. Guarda el resultado en `file_extracted_data`
6. Actualiza `file_uploads.status` a `'processed'` (o `'error'` con mensaje)

## Cambios en el frontend (`CargaDatos.tsx`)

1. Volver a insertar con `status: 'processing'` (ahora sí hay procesamiento real)
2. Después de insertar en `file_uploads`, llamar a `process-file` con el ID del registro
3. No bloquear la UI: el procesamiento corre en background
4. Mostrar el resultado cuando termine: badge "Procesado" + resumen de lo extraído
5. Si hay error, badge "Error" + mensaje

## Mejora al copiloto AI

Actualizar `fetchCompanyContext` en `ai-chat/index.ts` para incluir los datos extraídos de los archivos recientes, así el copiloto puede responder preguntas sobre los datos reales del negocio.

## Archivos tocados

1. **Nueva migración SQL** — tabla `file_extracted_data` + columna `processing_error` en `file_uploads`
2. **`supabase/functions/process-file/index.ts`** — nuevo edge function de procesamiento
3. **`src/pages/CargaDatos.tsx`** — flujo de upload + visualización de resultados
4. **`supabase/functions/ai-chat/index.ts`** — incluir datos extraídos en el contexto del copiloto

## Secrets necesarios

Todos ya están configurados:
- `OPENAI_API_KEY` — para la clasificación y extracción con IA
- `CLOUDFLARE_R2_*` — para descargar los archivos desde R2

