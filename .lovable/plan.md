

# Diagnóstico completo y plan de corrección definitivo

## Bugs encontrados

### BUG 1 (CRÍTICO): 6 archivos permanentemente atascados en `processing`
La base de datos tiene 6 archivos Excel con `status = 'processing'` que nunca se completaron. No hay mecanismo de recuperación — una vez que un archivo queda en `processing`, el worker lo ignora para siempre (solo busca `queued`). Resultado: esos 6 archivos nunca se van a procesar, y el cliente los ve como "Procesando" eternamente.

### BUG 2 (CRÍTICO): `process-file` no produce logs — probablemente crashea silenciosamente
No hay ni un solo log de `process-file` en el sistema. Esto indica que la función crashea al arrancar (probablemente por el import de SheetJS `npm:xlsx@0.18.5` en el entorno Deno de edge functions) o falla tan temprano que no llega a logear nada. Los archivos se marcan como `processing` pero `process-file` muere sin actualizar el status.

### BUG 3 (IMPORTANTE): process-queue no logea nada útil
El worker se ejecuta cada minuto (cron funciona) pero solo muestra `booted` y `shutdown`. No hay logs de "No queued files" ni errores — lo que sugiere que el worker también podría estar fallando silenciosamente al intentar llamar a `process-file`.

### BUG 4 (MODERADO): Sin timeout/recovery para archivos atascados
No hay lógica para detectar archivos que llevan más de X minutos en `processing` y resetearlos. Una vez atascados, quedan así para siempre.

### BUG 5 (POTENCIAL): SheetJS (`npm:xlsx`) puede no funcionar en Deno edge functions
La librería SheetJS se importa como `npm:xlsx@0.18.5`. Esta librería tiene dependencias de Node.js que pueden no ser compatibles con el runtime de Deno en edge functions, causando crash silencioso.

## Plan de corrección

### 1. Arreglar `process-file` para que funcione de verdad en Deno
- Reemplazar `npm:xlsx@0.18.5` por un approach que funcione en Deno (parsear Excel usando la URL de esm.sh o un método alternativo como `npm:xlsx@0.18.5/xlsx.mjs`)
- Agregar logging explícito al inicio de la función para diagnosticar crashes
- Agregar try/catch granular alrededor de cada sección

### 2. Agregar recuperación de archivos atascados en `process-queue`
- Al inicio de cada ejecución, buscar archivos con `status = 'processing'` que tengan `updated_at` o `created_at` > 10 minutos
- Resetear esos archivos a `queued` para que se reintenten
- Esto evita que archivos queden permanentemente atascados

### 3. Agregar columna `processing_started_at` a `file_uploads`
- Migración SQL: agregar `processing_started_at timestamptz`
- process-queue la setea al lockear el archivo
- Esto permite detectar con precisión cuánto tiempo lleva procesando

### 4. Mejorar logging en ambas funciones
- process-queue: logear cuántos archivos encontró, cuáles lockeó, resultados
- process-file: logear al inicio, al descargar de R2, al parsear, al llamar a GPT-4o, al guardar
- Con esto cualquier falla futura se diagnostica en segundos

### 5. Resetear los 6 archivos atascados
- Migración SQL: `UPDATE file_uploads SET status = 'queued' WHERE status = 'processing' AND created_at < NOW() - INTERVAL '5 minutes'`

### 6. Manejar timeout de edge functions
- Edge functions tienen un timeout de ~60 segundos
- Para archivos grandes con muchos chunks, cada chunk llama a GPT-4o (puede tardar 10-30s)
- Si hay >2 chunks, el timeout puede matarte
- Solución: procesar máximo 2 chunks por invocación, y si hay más, dejar el archivo como `queued` con metadata de progreso para continuar en la siguiente ejecución

## Archivos a modificar

1. **`supabase/functions/process-file/index.ts`** — Fix SheetJS import, agregar logging, manejar timeout
2. **`supabase/functions/process-queue/index.ts`** — Agregar recovery de archivos atascados, mejorar logging
3. **Migración SQL** — Agregar `processing_started_at`, resetear archivos atascados
4. **`src/pages/CargaDatos.tsx`** — Mostrar botón de "Forzar reproceso" para archivos stuck en processing >5min

## Resultado esperado

- Los 6 archivos atascados se van a reprocesar automáticamente
- Si `process-file` falla, los archivos se recuperan solos en la siguiente ejecución del cron
- SheetJS funciona correctamente en Deno
- Cada paso del procesamiento tiene logging visible
- No más archivos "fantasma" que quedan en `processing` eternamente

