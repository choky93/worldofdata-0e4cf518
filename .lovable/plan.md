

# Escalabilidad para empresas grandes — Análisis y plan

## Situación actual

Hoy el sistema tiene estos cuellos de botella para una empresa grande:

1. **Subida archivo por archivo** — el usuario arrastra archivos de a uno o pocos. Una empresa con 500 archivos de ventas mensuales tardaría horas.
2. **Procesamiento sincrónico** — cada archivo se procesa en el momento de la subida. Si hay 50 archivos, son 50 llamadas secuenciales a GPT-4o.
3. **Límite de 50 filas por archivo** — `MAX_ROWS = 50` en el edge function. Un CSV de 10,000 filas solo procesa las primeras 50.
4. **Sin paginación** — la lista de archivos carga todos de golpe. Con miles de archivos la UI se congela.
5. **Edge Functions tienen timeout de 150s** — un archivo muy pesado puede no terminar de procesarse.
6. **20MB por archivo** — suficiente para la mayoría, pero hay empresas que manejan exports de ERP de 100MB+.

## Qué se puede hacer — por etapas

### Etapa 1: Mejoras inmediatas (implementables ahora)

**A. Subida masiva (batch upload)**
- Permitir arrastrar carpetas o seleccionar muchos archivos a la vez
- Cola de subida visual con progreso individual
- Subir en paralelo (3-4 archivos simultáneos)

**B. Procesamiento en cola (async queue)**
- En vez de procesar cada archivo inline, marcar como "pendiente" y usar un sistema de cola
- Crear un edge function `process-queue` que procese archivos pendientes de a uno
- Activarlo con un cron job cada minuto (pg_cron + pg_net)
- Esto evita que el usuario espere y permite reintentos automáticos

**C. Paginación y filtros en la lista de archivos**
- Paginar de a 20-50 archivos
- Filtrar por tipo, estado, fecha, categoría
- Buscar por nombre
- Esto mantiene la UI rápida con miles de archivos

**D. Subir el límite de filas procesadas**
- Cambiar `MAX_ROWS` de 50 a 500 o más
- Para archivos muy grandes, procesar por lotes: primeras 500 filas → segunda tanda → etc.
- Guardar todas las tandas en `file_extracted_data`

### Etapa 2: Mejoras de mediano plazo

**E. Procesamiento por chunks para archivos grandes**
- CSVs de 100k filas: dividir en bloques de 500 filas, procesar cada bloque con GPT-4o, combinar resultados
- PDFs de muchas páginas: procesar página por página o en grupos de 5
- Esto permite archivos de cualquier tamaño sin timeout

**F. Subida por presigned URL (archivos >50MB)**
- En vez de pasar el archivo por el edge function, generar una URL firmada de R2
- El browser sube directo a R2, sin pasar por el servidor
- Elimina el límite práctico de tamaño y reduce la carga del servidor

**G. Dashboard de estado de procesamiento**
- Vista tipo "cola de trabajo" donde se ven todos los archivos en procesamiento
- Estimación de tiempo restante
- Cancelar procesamiento
- Ver errores con detalle

### Etapa 3: Escala enterprise

**H. Importación desde fuentes externas**
- Conectar directo con Google Drive, Dropbox, OneDrive
- APIs de ERPs comunes (SAP, Odoo, etc.)
- Importación programada (ej: todos los lunes traer el export del ERP)

**I. Procesamiento paralelo masivo**
- Múltiples instancias del edge function procesando en paralelo
- Sistema de prioridades (archivos urgentes primero)

## Recomendación

Implementar **Etapa 1 completa** ahora. Eso cubre el 90% de los casos de empresas medianas-grandes. Las etapas 2 y 3 se pueden ir agregando según la demanda real de los clientes.

## Archivos a modificar/crear

1. **`src/pages/CargaDatos.tsx`** — batch upload, paginación, filtros, cola visual
2. **`supabase/functions/process-file/index.ts`** — subir MAX_ROWS, procesamiento por chunks
3. **`supabase/functions/process-queue/index.ts`** (nuevo) — worker que procesa archivos pendientes
4. **Migración SQL** — cron job para activar process-queue cada minuto

## Detalle técnico

```text
FLUJO ACTUAL (1 archivo):
  Usuario → sube → R2 → process-file → GPT-4o → listo

FLUJO ESCALABLE (muchos archivos):
  Usuario → sube N archivos en paralelo → R2
       ↓
  file_uploads (status: "queued")
       ↓
  pg_cron cada 1 min → llama process-queue
       ↓
  process-queue toma el siguiente pendiente → process-file → GPT-4o
       ↓
  file_uploads (status: "processed") → UI se actualiza por polling
```

