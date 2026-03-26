
Diagnóstico

Encontré dos problemas estructurales, no un bug aislado:

1. Ingesta inconsistente de Excel
- Hoy hay dos caminos compitiendo:
  - el frontend sube el archivo, crea el registro y llama `process-file` directamente
  - en paralelo, el worker `process-queue` toma archivos `queued` y vuelve a llamar `process-file`
- Para `xls/xlsx`, `process-file` solo funciona si recibe `preParsedData`.
- El worker no envía `preParsedData`, por eso aparecen errores como `EXCEL_NEEDS_PREPARSED`.
- Resultado: algunos Excel procesan, otros fallan, otros quedan en `processing`, y el comportamiento parece aleatorio.

2. Los datos cargados no alimentan todavía los módulos del producto
- `CargaDatos.tsx` sí muestra resumen de lo extraído.
- Pero páginas como `Dashboard.tsx`, `Ventas.tsx` y `Stock.tsx` siguen leyendo `mock-data`.
- O sea: el archivo puede haberse cargado y extraído bien, pero el cliente “no lo ve reflejado” porque la plataforma principal todavía no consume esos datos reales.

Plan de corrección

1. Unificar el flujo de procesamiento
- Definir un solo camino oficial:
  `subida → registro en base → status queued → worker procesa`
- Quitar la invocación directa a `process-file` desde `CargaDatos.tsx`.
- El frontend debe solo subir y encolar, no procesar.
- Así evitamos doble ejecución, carreras y estados inconsistentes.

2. Hacer que el backend procese Excel por sí solo
- Modificar `process-file` para parsear `xls/xlsx` directamente desde el archivo almacenado.
- Eliminar la dependencia obligatoria de `preParsedData`.
- `preParsedData` puede quedar solo como optimización opcional, no como requisito.
- Con esto:
  - el worker podrá procesar Excel
  - reprocesar funcionará siempre
  - las importaciones por URL también podrán procesar Excel correctamente

3. Corregir estados y visibilidad en Carga de Datos
- No marcar un upload como “done” en la UI antes de que realmente termine la extracción.
- Mejorar transición de estados:
  - `uploading`
  - `queued`
  - `processing`
  - `processed` / `error`
- Mostrar cuando hay datos parciales en chunks pero el archivo aún sigue procesando.
- Asegurar que `processing_error` se vea completo y no truncado en casos críticos.

4. Evitar re-procesamientos simultáneos del mismo archivo
- Antes de que el worker tome un archivo, hacer lock lógico/atómico sobre el registro.
- Si un archivo ya está en `processing`, ningún otro flujo debe volver a tomarlo.
- Revisar también `handleReprocess` para que no pueda disparar duplicados si ya hay proceso activo.

5. Hacer que los datos cargados impacten el producto
- Reemplazar `mock-data` en módulos clave por datos reales derivados de `file_extracted_data`.
- Empezar por:
  - `Dashboard`
  - `Ventas`
  - `Stock`
- Construir una capa de lectura/normalización para convertir `extracted_json` en métricas reales.
- Si no hay datos suficientes, mostrar empty states claros en vez de mocks.

6. Validación completa
- Probar de punta a punta estos casos:
  - CSV chico
  - CSV grande con chunks
  - XLS/XLSX chico
  - XLS/XLSX grande
  - PDF
  - reproceso de Excel
  - varios archivos simultáneos
- Verificar en cada caso:
  - estado final correcto
  - registros en `file_extracted_data`
  - reflejo en `CargaDatos`
  - reflejo en `Dashboard/Ventas/Stock`

Prioridad recomendada

Fase A — urgente
- Unificar flujo
- Backend parsea Excel
- Corregir estados y locks

Fase B — necesaria para el cliente
- Conectar Dashboard/Ventas/Stock a datos reales

Resultado esperado

Después de esto, la historia cambia a:
- cualquier archivo subido entra a una cola única
- Excel deja de fallar por `EXCEL_NEEDS_PREPARSED`
- no habrá dobles ejecuciones ni archivos “colgados”
- lo cargado no solo se verá en Historial de cargas, sino también reflejado en la plataforma

En síntesis: sí, hay algo estructuralmente mal hoy, y es exactamente la combinación de doble procesamiento + dependencia rota de Excel + módulos que todavía siguen mostrando datos ficticios. El arreglo correcto no es un parche puntual: hay que cerrar esos tres frentes juntos.
