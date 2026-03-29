
# Solución para destrabar de verdad la carga de archivos

## Qué confirmé al revisar el sistema

Sí, el problema es real y ya se ve claro dónde está:

1. **Los archivos grandes de Excel siguen chocando contra límites de cómputo del backend**
   - Hay errores reales `546 WORKER_LIMIT` y `504`.
   - Hoy `process-queue` dispara varios archivos en paralelo y `process-file` vuelve a **descargar y parsear el Excel completo en cada reintento**, aunque ya vaya por el bloque 20/39. Eso desperdicia CPU/memoria y explica por qué quedan en `processing` o fallan a mitad de camino.

2. **Hay datos procesados que sí existen en la base, pero no se reflejan bien en la UI**
   - Revisé datos de marketing ya extraídos.
   - La UI espera campos como `gasto` o `importe`, pero los archivos reales traen cosas como `importe_gastado_ars`.
   - Además vienen números con formato local (`1.717.146,04`) y hoy se parsean mal, por eso pueden aparecer métricas en `$0` aunque el archivo esté procesado.

3. **Hay archivos “a mitad de camino”**
   - Vi archivos con `next_chunk_index = 20` y bloques ya guardados, o sea: no están vacíos, pero tampoco terminaron.
   - El sistema necesita mostrar mejor ese progreso y terminarlo de forma más segura.

## Plan de corrección

### 1. Hacer robusto el procesamiento de archivos pesados
**Archivos:** `supabase/functions/process-file/index.ts`, `supabase/functions/process-queue/index.ts`

- Bajar la presión del worker para archivos pesados:
  - procesar menos bloques por invocación para Excel grandes
  - evitar paralelizar varios Excels grandes al mismo tiempo
- Diferenciar archivos “livianos” vs “pesados” y hacer que la cola trate los pesados de forma más conservadora
- Mejorar el manejo de estados para que un archivo no quede colgado en `processing` por una ejecución que murió por recursos

### 2. Evitar reparsear el Excel completo en cada reanudación
**Backend + migración nueva**

- Persistir el resultado del parseo inicial en bloques reutilizables
- En vez de reabrir y reprocesar el `.xls/.xlsx` completo cada vez, reanudar desde el bloque ya preparado
- Esto ataca el problema principal de CPU/memoria y hace mucho más estable el flujo para clientes grandes

## 3. Corregir la interpretación de números y campos reales
**Archivos:** `src/pages/Marketing.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Ventas.tsx`, `src/pages/Finanzas.tsx`, util compartida nueva o `src/lib/formatters.ts`

- Crear un parser numérico robusto para formatos tipo:
  - `1.717.146,04`
  - `$ 961.199,79`
  - `84.30389878`
- Ampliar aliases de columnas reales detectadas por IA, por ejemplo en marketing:
  - `importe_gastado`
  - `importe_gastado_ars`
  - `resultados`
  - `alcance`
  - `impresiones`
- Unificar esto en una utilidad compartida para que no falle distinto en cada pantalla

### 4. Mostrar progreso real y no ambiguo en Carga de Datos
**Archivo:** `src/pages/CargaDatos.tsx`

- Mostrar progreso por bloques cuando el archivo es grande:
  - ejemplo: `Procesando bloque 20 de 39`
- Mostrar si ya hay datos parciales extraídos
- Diferenciar mejor:
  - en cola
  - procesando
  - parcialmente procesado
  - error recuperable
- Así el usuario entiende si está avanzando de verdad o si quedó trabado

### 5. Validación final con los casos que hoy fallan
**Prueba objetivo**

Voy a validar específicamente con el tipo de archivos que hoy están dando problemas:
- `Informe Ganancia de productos vendidos.xlsx`
- `Informe Rubro mas vendido...`
- `informe productos mas vendidos...`
- reportes de marketing como los de la captura

## Resultado esperado

Después de estos cambios, el sistema debería:

- dejar de romperse con archivos Excel grandes por reparseo innecesario
- terminar los archivos pesados por bloques de forma estable
- reflejar correctamente los datos cargados en Dashboard y Marketing
- mostrar al usuario progreso real y errores claros
- evitar que queden archivos eternamente en `processing`

## Detalle técnico

### Archivos a tocar
- `supabase/functions/process-file/index.ts`
- `supabase/functions/process-queue/index.ts`
- migración nueva para persistencia de bloques/preproceso
- `src/pages/CargaDatos.tsx`
- `src/pages/Marketing.tsx`
- `src/pages/Dashboard.tsx`
- posiblemente `src/pages/Ventas.tsx` y `src/pages/Finanzas.tsx`
- utilidad compartida para parseo numérico

### Cambio clave
El cambio más importante no es “subir límites” otra vez, sino **cambiar la arquitectura de reanudación** para que un archivo grande no vuelva a empezar el trabajo caro en cada vuelta del worker.
