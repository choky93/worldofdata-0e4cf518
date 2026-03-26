

# Mejora del pipeline de archivos — OpenAI GPT-4o como modelo principal

## Problemas actuales

1. **PDFs no se leen** — línea 180 solo manda el nombre del archivo a la IA, no el contenido real
2. **Modelo débil** — `gpt-4o-mini` para clasificación de datos. Para una plataforma de pago necesitás `gpt-4o` que tiene mejor visión y razonamiento
3. **CSV parser frágil** — no maneja campos entrecomillados con delimitadores internos ni BOM UTF-8
4. **Reprocess de Excel no manda datos** — el botón "Reprocesar" no envía `preParsedData`, así que los Excel reprocesados caen al fallback inútil
5. **Sin polling** — el usuario ve "Procesando" sin actualización automática

## Plan de cambios

### 1. `supabase/functions/process-file/index.ts` — Modelo GPT-4o + PDFs con visión

**Modelo**: Cambiar de `gpt-4o-mini` a `gpt-4o`. Es el mejor modelo de OpenAI para visión y razonamiento con datos numéricos. El costo extra es mínimo comparado con el valor del servicio.

**PDFs**: Convertir las primeras páginas del PDF a base64 y enviarlas como imágenes al endpoint de visión de GPT-4o. GPT-4o puede leer tablas, facturas, reportes directamente desde imágenes de páginas PDF. Si el PDF es mayor a 2MB, truncar.

**Imágenes**: Subir el límite de 500KB a 2MB para imágenes, ya que GPT-4o maneja bien imágenes grandes.

**CSV parser**: Implementar parsing RFC 4180 que maneje:
- BOM UTF-8 (`\uFEFF`)
- Campos entrecomillados con delimitadores internos (`"Producto A, grande",1500`)
- Detección de delimitador (coma, punto y coma, tab)

**max_tokens**: Subir de 2048 a 4096 para que GPT-4o pueda devolver datasets más completos.

### 2. `src/pages/CargaDatos.tsx` — Reprocess con Excel + Polling

**Reprocess Excel**: Cuando el usuario hace click en "Reprocesar" un archivo Excel, descargar el archivo desde R2 vía una función auxiliar, parsearlo con SheetJS en el cliente, y enviar `preParsedData` al edge function.

**Polling automático**: Cuando hay archivos en estado "processing", hacer polling cada 5 segundos para actualizar el estado. Se detiene cuando no quedan archivos procesándose.

**Resumen post-proceso**: Mostrar debajo de cada archivo procesado la categoría detectada y el resumen de la IA.

### 3. `supabase/functions/ai-chat/index.ts` — Ya usa GPT-4o, no requiere cambios

El copiloto ya usa `gpt-4o` (línea 269). No se toca.

## Archivos a modificar

1. **`supabase/functions/process-file/index.ts`** — GPT-4o, visión para PDFs, CSV parser robusto, límites ajustados
2. **`src/pages/CargaDatos.tsx`** — reprocess con preParsedData, polling, resumen visual

## Resultado esperado

- PDFs se procesan con datos reales usando visión de GPT-4o
- Imágenes de facturas/reportes se leen correctamente
- CSVs con formatos complejos se parsean bien
- Reprocesar Excel funciona igual que la primera subida
- El usuario ve en tiempo real cuando termina el procesamiento
- Todo usando la API de OpenAI del cliente, sin cambios de proveedor

