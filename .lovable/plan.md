
Resumen

- Voy a corregir 4 cosas: fechas Excel persistidas como serial, lectura mensual en Dashboard/Ventas, visibilidad real de Marketing, y reproceso roto por archivos de prueba sin archivo físico.

Diagnóstico confirmado

- El XLS de ventas sigue guardándose con `Mes: "45231.0"` en `file_extracted_data`; la UI hoy lo puede “dibujar”, pero no queda normalizado en base.
- El eje hasta 2025 no necesariamente está mal: con 26 períodos desde nov-2023 el rango cae en 2025. El problema es que el producto no aclara que son meses/períodos y no transacciones.
- El archivo de marketing no quedó “procesado pero oculto”: está en `status=error` con `R2 download failed [404]`.
- Ese archivo usa `storage_path = test/marketing.csv` (y ventas `test/ventas.xls`), que no coincide con el formato real del uploader; son artefactos de prueba/manuales, por eso reprocesar falla.
- Además, Marketing puede quedar invisible si la sección depende del onboarding en vez de la data real, y la página actual filtra filas sin `campaign_name`.

Plan de implementación

1. Blindar fechas de punta a punta
- `supabase/functions/process-file/index.ts`: normalizar siempre fechas antes de persistir cada batch, con fallback usando `column_mapping.date` además de keywords, y evitar guardar seriales Excel otra vez.
- `src/lib/data-cleaning.ts` + `src/lib/formatters.ts`: unificar parser/formatter robusto y dejar de depender de `new Date(raw)` directo.

2. Hacer que Ventas/Dashboard entiendan archivos mensuales
- `src/pages/Dashboard.tsx`: ordenar por fecha real, cambiar copy a “meses/períodos” cuando corresponda, mostrar rango cargado y usar título dinámico (“Ventas por mes”).
- `src/pages/Ventas.tsx`: modo de tabla/visualización mensual si el archivo solo trae período + monto; no simular clientes/productos/transacciones.
- `src/pages/Operaciones.tsx`: reutilizar el parser robusto para orden y render de fechas.

3. Hacer visible Marketing cuando hay datos
- `src/components/AppSidebar.tsx` y `src/pages/Dashboard.tsx`: la visibilidad del módulo no debe depender solo de onboarding; si existe data de marketing, la sección debe aparecer.
- `src/pages/Marketing.tsx`: soportar archivos sin `campaign_name` mostrando registros/resumen por fecha en vez de quedar vacío.

4. Arreglar reproceso y limpiar artefactos rotos
- `src/pages/CargaDatos.tsx`: mostrar un error claro si el archivo físico no existe en storage y evitar venderlo como “reprocesable” cuando falta el objeto.
- `supabase/functions/r2-download/index.ts` / `supabase/functions/process-file/index.ts`: devolver mensaje semántico para storage 404 (“archivo no encontrado, volvé a subirlo”), no un 500 genérico.
- Limpiar los registros sintéticos `test/...` y repetir la prueba con subida real por UI, no con inserciones manuales.

5. Validación real y regresión mínima
- Re-subir el XLS y el CSV desde la UI.
- Verificar persistencia ISO, chart ordenado, copy mensual correcto, Marketing visible y reproceso sano.
- Agregar regresiones puntuales para: serial Excel → ISO y storage missing → error claro.

Detalles técnicos

- No hace falta cambiar schema ni permisos; el problema es de pipeline, render y visibilidad.
- Para el sidebar usaré un indicador liviano de categorías disponibles, no una carga pesada de todas las filas.

Archivos a tocar

- `supabase/functions/process-file/index.ts`
- `supabase/functions/r2-download/index.ts`
- `src/lib/data-cleaning.ts`
- `src/lib/formatters.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Ventas.tsx`
- `src/pages/Operaciones.tsx`
- `src/pages/Marketing.tsx`
- `src/components/AppSidebar.tsx`
- `src/pages/CargaDatos.tsx`

Resultado esperado

- Las fechas quedan bien guardadas y bien mostradas.
- El dashboard deja de hablar de “26 registros” si en realidad son 26 meses.
- Marketing deja de desaparecer por una mezcla de error + visibilidad.
- Reprocesar deja de fallar de forma opaca: o funciona, o explica exactamente qué falta.
