

# Fix: Archivos no se procesan + Detección de duplicados

## Problema raíz

Revisé todo el pipeline y encontré lo siguiente:

1. **`file_extracted_data` está vacía** — los 7 archivos dicen `processed` pero no tienen datos extraídos. Esto viene de una versión anterior del código que marcaba `processed` sin hacer nada.

2. **`process-file` se cuelga al invocarlo** — lo probé directamente y devolvió timeout ("context canceled"). El problema más probable es que **`npm:xlsx@0.18.5` es demasiado pesado** para importar en un Edge Function de Deno. Son ~2MB de librería que se importa en cada cold start, y combinado con `npm:aws4fetch`, el boot time excede el límite.

3. **No hay detección de duplicados** — si el usuario sube el mismo archivo dos veces, se procesan ambos y se suman las métricas dos veces.

## Plan de corrección

### 1. Reescribir `process-file` sin dependencia pesada de XLSX

**Archivo:** `supabase/functions/process-file/index.ts`

El cambio principal es **no parsear Excel en el Edge Function**. En vez de importar `npm:xlsx` (que revienta los límites de boot), usar una estrategia en dos partes:

- **CSV/TXT/XML**: parsear directamente con código nativo (ya funciona bien, es liviano)
- **Excel (XLS/XLSX)**: en vez de usar SheetJS en el Edge Function, convertir el archivo a base64 y enviarlo a OpenAI con instrucciones de que extraiga los datos. OpenAI `gpt-4o-mini` puede leer archivos Excel enviados como attachment. Alternativamente, hacer el parseo de Excel **en el frontend** antes de subir (usando SheetJS del lado del cliente, donde no hay límites de CPU) y enviar el JSON ya parseado junto con el archivo.

**Enfoque recomendado: parsear Excel en el frontend**
- En `CargaDatos.tsx`, antes de llamar a `process-file`, si el archivo es XLS/XLSX, usar SheetJS (ya está en el bundle del cliente) para extraer las primeras 50 filas como JSON
- Enviar ese JSON pre-parseado como parte del body de `process-file`
- `process-file` solo necesita llamar a OpenAI para clasificar/estructurar, sin necesidad de importar XLSX

Esto elimina la dependencia pesada del Edge Function y resuelve el timeout.

### 2. Detección de duplicados por hash

**Archivos:** `CargaDatos.tsx` + migración de DB

- Agregar columna `file_hash` (TEXT) a la tabla `file_uploads`
- En el frontend, calcular un hash SHA-256 del archivo antes de subirlo (usando `crypto.subtle.digest`)
- Antes de insertar en `file_uploads`, consultar si ya existe un archivo con el mismo hash para la misma empresa
- Si existe, mostrar un toast: "Este archivo ya fue cargado anteriormente" y no procesarlo de nuevo
- Si es un archivo nuevo, guardar el hash junto con el registro

### 3. Limpieza de archivos viejos con status incorrecto

Los 7 archivos actuales dicen `processed` pero no tienen datos. Dos opciones:
- **Opción A**: Agregar un botón "Reprocesar" que detecte archivos sin datos en `file_extracted_data` y los reenvíe al pipeline
- **Opción B** (más simple): Actualizar el status de esos archivos a `pending` para que el usuario sepa que necesitan reprocesarse, y agregar lógica para reprocesar

### Archivos a modificar

1. **`supabase/functions/process-file/index.ts`** — quitar `npm:xlsx`, recibir datos pre-parseados del frontend
2. **`src/pages/CargaDatos.tsx`** — parsear Excel en el cliente, calcular hash, detectar duplicados, botón reprocesar
3. **Migración SQL** — agregar columna `file_hash` a `file_uploads`

### Resultado esperado

- Archivos Excel se procesan en segundos (parseo en cliente, solo clasificación en servidor)
- CSV/PDF/imágenes siguen procesándose como antes pero sin el peso de XLSX
- Archivos duplicados se detectan antes de subir y se avisa al usuario
- Los archivos viejos se pueden reprocesar con un click

