# Pipeline de archivos — Estado actual (implementado)

## Cambios realizados

### 1. `supabase/functions/process-file/index.ts` — Reescrito completo

- **Modelo**: GPT-4o con max_tokens 4096
- **PDF**: Extracción de texto real con `unpdf` (pdfjs-serverless). Si el PDF tiene texto embebido, se extrae y se envía como texto a GPT-4o. Si es escaneado y tiene poco texto, se usa el texto parcial + nombre como contexto
- **CSV**: Parser RFC 4180 con BOM UTF-8, campos entrecomillados, detección automática de delimitador
- **Imágenes**: Visión GPT-4o hasta 5MB
- **Excel sin preParsedData**: Error explícito pidiendo reproceso desde el cliente (no más fallback inútil por nombre)
- **Metadata de procesamiento**: Cada archivo registra qué método se usó (text_extraction, vision, client_preparsed, etc.)

### 2. `supabase/functions/r2-download/index.ts` — Nueva función

- Descarga archivos de R2 de forma segura
- Valida autenticación y pertenencia a la empresa
- Retorna el archivo como blob con el MIME correcto

### 3. `src/pages/CargaDatos.tsx` — Reprocess funcional

- **Reprocess Excel**: Descarga el archivo via `r2-download`, lo parsea con SheetJS, y envía `preParsedData`
- **Polling**: Auto-refresh cada 5s mientras hay archivos procesándose
- **Resumen visual**: Muestra categoría, filas y resumen de IA bajo cada archivo procesado

## Estrategia de procesamiento por formato

| Formato | Método | Límite |
|---------|--------|--------|
| CSV/TXT | Texto parseado | 15K chars |
| XML | Texto raw | 15K chars |
| Excel | preParsedData del cliente (SheetJS) | 8K chars |
| PDF (con texto) | unpdf text extraction → texto | 15K chars |
| PDF (escaneado) | Texto parcial + contexto | 15K chars |
| Imágenes | GPT-4o visión base64 | 5MB |
| Word | Texto raw | 15K chars |
