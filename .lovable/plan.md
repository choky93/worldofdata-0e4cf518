
Objetivo: aclarar la confusión y ajustar el plan para no obviar nada del pipeline.

## Qué está pasando de verdad

No: el problema no es “OpenAI no lee PDF” en general. El problema es que la implementación actual del proyecto usa el camino incorrecto.

### 1. PDFs
Hoy `process-file` hace esto:
- descarga el PDF
- lo convierte a base64
- lo manda al endpoint de `chat/completions`
- pero lo envía como `image_url` con MIME `application/pdf`

Ese formato no coincide con cómo el flujo actual de visión espera imágenes. O sea: hoy no está leyendo el PDF como documento real; por eso falla o termina “adivinando” por nombre/tamaño.

Conclusión:
- Sí existen formas de procesar PDFs con OpenAI.
- Lo que no funciona es esta implementación puntual.
- Entonces el plan correcto no es “resignarse con PDF”, sino cambiar el método de envío del PDF.

### 2. Excel
OpenAI tampoco “lee Excel mágicamente” en el flujo actual del proyecto.
Hoy el sistema depende de:
- parsearlo en frontend con SheetJS y mandar `preParsedData`, o
- caer en un fallback malo que solo describe el archivo por nombre

Además, en reproceso el frontend no vuelve a generar `preParsedData`, así que ahí queda roto.

Conclusión:
- El problema no es que el modelo no pueda trabajar con datos tabulares.
- El problema es que el pipeline actual no le está entregando el contenido correcto del Excel.

### 3. Límite de 5 MB / 2 MB
Acá hay dos límites distintos y se mezclaron:

1. **Límite de subida / almacenamiento**
- La UI hoy dice 20MB.
- R2 puede guardar archivos más grandes.
- Ese no es el cuello de botella principal.

2. **Límite interno de procesamiento IA**
- El código actual tiene `MAX_IMAGE_BYTES = 2 * 1024 * 1024`.
- Ese límite no es de R2.
- Es un límite artificial del pipeline para evitar mandar payloads inline enormes en base64 al modelo.

O sea:
- el usuario puede subir 20MB
- pero después el procesamiento actual se autolimita a 2MB en ciertos tipos de archivo
- ahí está la inconsistencia real

## Qué falta corregir en el plan

El plan anterior debe ajustarse en estos puntos:

### A. Separar claramente “subida” de “procesamiento”
Vamos a mantener un límite de subida alto para el usuario, pero rediseñar el procesamiento:
- archivos grandes se guardan completos en R2
- el pipeline toma solo la parte necesaria para IA
- no se intenta meter el archivo entero inline en base64 cuando no conviene

### B. PDFs: cambiar el mecanismo, no solo el modelo
No alcanza con “usar GPT-4o o GPT-5”.
El arreglo debe ser:
- dejar de mandar PDFs como `image_url` con `application/pdf`
- implementar una ruta correcta para PDF:
  - extracción de texto si el PDF ya trae texto
  - y fallback visual / por páginas cuando haga falta
- además, guardar trazas de qué método se usó para cada archivo

### C. Excel: el contenido tiene que llegar siempre
Hay que cerrar el agujero del reproceso:
- upload inicial: parseo cliente si es Excel
- reproceso: descargar el archivo y volver a parsearlo, o persistir una versión preparseada reutilizable
- nunca volver a depender del fallback por nombre de archivo

### D. Límite grande para usuario, límite inteligente para IA
El ajuste correcto no es “subir todo a 5MB y listo”.
Debe quedar así:
- subida: permitir archivos más grandes
- procesamiento:
  - CSV/XML/TXT: por texto, sin castigar tanto el tamaño
  - Excel: parseo estructurado, no visión
  - PDF: extracción por texto/páginas, no archivo inline crudo
  - imágenes: compresión o reducción antes de IA si exceden el umbral

Eso permite soportar archivos grandes sin romper CPU, memoria o latencia.

## Plan ajustado de implementación

### 1. `supabase/functions/process-file/index.ts`
Cambiar la lógica de procesamiento por tipo:

- **CSV/TXT/XML**
  - seguir por texto
  - robustecer parseo y detección de delimitadores/encoding

- **Excel**
  - exigir `preParsedData` cuando exista
  - mejorar fallback para que no sea “inferí por nombre”
  - si no hay `preParsedData`, marcar error explícito y no falso positivo

- **PDF**
  - eliminar el envío incorrecto como `image_url` con `application/pdf`
  - implementar estrategia por capas:
    - primero extracción textual
    - si no alcanza, fallback visual o segmentado
  - registrar resumen técnico del método usado

- **Imágenes**
  - mantener visión
  - comprimir/reducir antes de IA si excede umbral

### 2. Nueva función de descarga para reproceso
Crear una función backend para descargar desde R2 de forma segura.

Uso:
- reprocesar Excel
- reprocesar PDF si hace falta volver a preparar contenido
- evitar stubs vacíos en frontend

### 3. `src/pages/CargaDatos.tsx`
Completar el flujo real del frontend:

- validación de tamaño coherente con lo que el backend realmente soporta
- reproceso funcional de Excel
- mejor feedback de estado
- mensajes distintos para:
  - “subido correctamente”
  - “guardado pero no procesado”
  - “procesado parcialmente”
  - “duplicado detectado”

### 4. Política de tamaño
Ajustar el producto a una política clara:

- **subida**: mantener o ampliar sobre 20MB según el flujo real deseado
- **procesamiento**: por estrategia, no por un único número fijo
- mostrar en UI una explicación correcta, por ejemplo:
  - “Se pueden subir archivos grandes; para algunos formatos procesamos automáticamente las primeras hojas/páginas o una versión optimizada para análisis”

## Respuesta concreta a tus dudas

### “¿Ningún OpenAI lee PDF?”
Sí, se puede trabajar con PDF usando OpenAI. El problema actual es de implementación, no una imposibilidad absoluta del proveedor.

### “¿Ni GPT-5?”
El problema no se resuelve solo cambiando de modelo. Si el archivo se manda mal, incluso un modelo mejor recibe el input equivocado. Primero hay que corregir el pipeline.

### “¿Por qué no dejar archivos más grandes?”
Se puede. El límite chico que aparece en la discusión no es por almacenamiento, sino por cómo hoy se empaqueta el archivo para IA. El plan correcto es dejar subir archivos grandes y procesarlos con una estrategia adecuada por formato.

## Resultado esperado tras este ajuste

- PDFs dejan de “fallar por diseño”
- Excel deja de depender de un fallback inútil
- el reproceso funciona de verdad
- la plataforma puede aceptar archivos grandes sin prometer un procesamiento bruto e ineficiente
- el usuario entiende qué se sube completo, qué se procesa completo y qué se procesa parcialmente

## Archivos implicados

- `supabase/functions/process-file/index.ts`
- `src/pages/CargaDatos.tsx`
- nueva función backend para descarga desde R2
- posiblemente ajustes menores en textos de UI para reflejar el límite real y la estrategia de procesamiento

## Detalle técnico
```text
Usuario sube archivo grande
        |
        v
     R2 guarda completo
        |
        v
process-file decide estrategia:
- CSV/XML/TXT -> texto
- XLS/XLSX -> parseo estructurado
- PDF -> texto + fallback por páginas
- Imagen -> visión optimizada
        |
        v
IA recibe contenido útil, no archivo mal empaquetado
        |
        v
file_extracted_data + estado confiable
```
