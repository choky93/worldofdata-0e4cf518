
Diagnóstico honesto

Hoy no te diría “ya está resuelto”. Te diría esto, corto y directo:

1. El problema de “ventas en $0” mejoró
- Eso sí quedó bastante mejor porque ahora las métricas reconocen más nombres de columnas (`ganancia`, `monto_total`, `precio`, etc.).
- Esa parte es implementable y ya está encaminada.

2. El problema grande de fondo NO está resuelto del todo
- La carga automática de archivos pesados sigue siendo frágil.
- Hay evidencia concreta:
  - `Informe Ganancia de productos vendidos.xlsx` sigue en `error` con `WORKER_LIMIT`.
  - `Imforme ganancia de marcas .xls` figura como `processed`, pero en sus chunks hay muchos bloques con `row_count: 0` y `summary: "No se pudo interpretar la respuesta de IA"`.
- Traducción: no solo falla la carga; a veces “termina” pero con datos parciales o degradados.

El problema real

No es “falta otro botón”.
No es “hay que insistir con reprocesar”.
El problema real es este:

- Se está usando IA para interpretar tablas grandes que ya vienen estructuradas.
- Además, esos archivos se convierten a CSV/texto y se cortan por cantidad de caracteres, no por filas.
- Cuando cortás por caracteres, partís filas/celdas a la mitad.
- Resultado: la IA en muchos bloques ya no entiende la tabla y devuelve vacío, `otro`, o 0 filas.

En otras palabras:
- El reproceso manual hoy es un parche.
- La arquitectura actual sigue dependiendo demasiado de IA para algo que debería procesarse de forma determinística.

Soluciones concretas

Solución 1 — Recomendada
Problema:
Excel/CSV grandes se procesan como texto + IA por chunks.

Solución:
Procesar archivos tabulares como datos estructurados, no como texto libre.
- Parsear XLS/XLSX/CSV a filas reales.
- Dividir por lotes de filas (ej. 200/500 filas), no por caracteres.
- Guardar esos lotes tal cual.
- Usar IA solo para clasificar el archivo y/o mapear encabezados, no para “releer” toda la tabla.

¿La puedo implementar acá?
Sí.

¿Necesita otra IA?
No. De hecho, necesita menos IA.

¿Necesita API externa?
No.

Impacto:
- Elimina gran parte de los `WORKER_LIMIT`.
- Evita chunks rotos.
- Hace que las métricas sean mucho más confiables.

Solución 2 — Hacer el parseo pesado en el navegador automáticamente
Problema:
Algunos Excel pesados siguen cayendo en el backend y revientan.

Solución:
Para Excel grandes:
- parseo siempre del lado del navegador,
- en background,
- y envío en lotes chicos estructurados.

¿La puedo implementar acá?
Sí.

¿Sirve sola?
Ayuda mucho, pero sola no alcanza si después seguís mandando CSV cortado por caracteres.

Impacto:
- Muy buena para evitar límites del backend.
- Debe combinarse con la Solución 1.

Solución 3 — Cola de importación real por lotes + reintento automático
Problema:
Si un lote falla, hoy el archivo puede quedar en error o “processed” con datos incompletos.

Solución:
- Registrar progreso por batch.
- Reintento automático de batches fallidos.
- Marcar un archivo como `processed` solo si terminó el 100% de los batches válidos.
- Si faltan batches, queda `partial` o `processing`, no `processed`.

¿La puedo implementar acá?
Sí.

¿Necesita otra herramienta?
No.

Impacto:
- Evita falsos “procesado OK”.
- Te da trazabilidad real.

Solución 4 — Dejar de usar IA para extracción de filas y usarla solo para clasificación/mapeo
Problema:
La IA está haciendo trabajo repetitivo y poco confiable sobre tablas.

Solución:
- Detectar columnas con lógica propia.
- Normalizar encabezados con reglas.
- Usar IA solo para:
  - identificar categoría del archivo,
  - sugerir equivalencias de columnas dudosas,
  - resumir.

¿La puedo implementar acá?
Sí.

¿Es mejor que cambiar de IA?
Sí. Cambiar de IA no arregla que el diseño esté mal planteado para tablas grandes.

Solución 5 — Usar un producto externo especializado
Opciones típicas en proyectos similares:
- Flatfile
- CSVBox
- herramientas de importación con mapping/validación

Qué hacen estos productos:
- parsean archivos en frontend,
- validan columnas,
- suben en batches,
- muestran errores por fila,
- no dependen de IA para leer planillas.

¿Hace falta?
No obligatoriamente.

¿Cuándo sí?
- Si querés una experiencia de importación enterprise ya resuelta,
- con mapping visual de columnas,
- validación avanzada,
- y menos código propio.

Mi recomendación sincera:
No empezaría por una API externa todavía.
Primero corregiría la arquitectura interna.
Si después querés una UX de importación premium, recién ahí evaluaría Flatfile/CSVBox.

Qué usan proyectos similares

El patrón sano hoy es:
1. Browser-side parsing para XLS/XLSX/CSV grandes
2. Web worker o procesamiento no bloqueante en frontend
3. Upload por batches de filas
4. Cola asíncrona en backend
5. Reintentos por batch
6. Validación/mapping de columnas
7. IA opcional para clasificación o ayuda, no para reextraer toda la planilla

Ese patrón coincide bastante con lo que ya empezaste a hacer, pero a medias.
Lo que falta es el paso importante:
dejar de tratar planillas grandes como texto partido.

Conclusión concreta

Este es el problema:
- La arquitectura de ingesta todavía rompe datos grandes porque mezcla parseo tabular con extracción por IA basada en texto chunked.

Esta es la solución:
- Pasar a un pipeline estructurado por filas/batches.
- Parsear Excel/CSV automáticamente del lado cliente para archivos pesados.
- Guardar batches estructurados.
- Usar IA solo para clasificación y normalización liviana.
- No marcar “processed” si faltan batches o si hubo chunks vacíos importantes.

¿Lo puedo implementar?
Sí.

¿Hace falta otra IA?
No.

¿Hace falta otro programa?
No, no como requisito.

¿Hace falta una API externa?
No. Es opcional, no necesaria.

Plan propuesto

1. Corregir la arquitectura de ingesta tabular
- Reemplazar chunking por caracteres por chunking por filas.
- Aplicarlo tanto a carga inicial como a reproceso.

2. Separar “parseo” de “clasificación”
- Parseo determinístico para XLS/XLSX/CSV.
- IA solo para categoría/resumen/mapeo si hace falta.

3. Endurecer estados del pipeline
- `processed` solo al completar todos los lotes.
- agregar manejo de `partial` o equivalente si faltan lotes.
- reintentos automáticos por batch.

4. Corregir métricas para consumir solo datos válidos
- excluir chunks vacíos/rotos del agregado.
- revisar que Dashboard, Ventas y Finanzas lean datos consistentes.

5. Reparar archivos históricos
- reingestar automáticamente los archivos grandes ya cargados que hoy quedaron en `error` o con extracción parcial.

Archivos que tocaría

- `src/pages/CargaDatos.tsx`
- `supabase/functions/process-file/index.ts`
- `supabase/functions/process-queue/index.ts`
- `src/hooks/useExtractedData.ts`
- `src/lib/field-utils.ts`
- posiblemente una migración chica si hace falta persistir batches/estado parcial de forma más clara

Resultado esperado

- El usuario sube el archivo y funciona sin tocar “Reprocesar”.
- Los Excel grandes dejan de caer por memoria.
- Los archivos no quedan “procesados” con media información.
- Las métricas dejan de depender de extracción incompleta.
- Lo que vea el usuario en Dashboard/Ventas/Finanzas pasa a ser confiable de verdad.
