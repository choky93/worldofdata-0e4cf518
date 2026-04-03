

# Plan: Arreglar inserts que fallan silenciosamente por constraint único

## Diagnóstico raíz

El problema es un **constraint único** en la tabla `file_extracted_data`:

```text
UNIQUE INDEX idx_unique_file_chunk ON (file_upload_id, chunk_index)
```

Cuando se procesa un archivo, el sistema intenta insertar **3 registros con el mismo `chunk_index: 0`**:
1. `_classification` → chunk_index 0
2. `_column_mapping` → chunk_index 0  
3. Datos reales (batch 0) → chunk_index 0

El segundo y tercer insert **fallan silenciosamente** por violación del constraint. Resultado: `file_extracted_data` queda vacío, el health check detecta "se guardaron 0 de 26 filas", y la UI no muestra nada.

Esto afecta tanto el PATH A (subida desde el navegador) como el PATH C (procesamiento server-side).

## Solución

Usar `chunk_index` negativos para metadata, dejando los positivos para datos reales:

- `_classification` → `chunk_index: -2`
- `_column_mapping` → `chunk_index: -1`
- Datos batch 0 → `chunk_index: 0` (sin conflicto)

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/process-file/index.ts` | Cambiar `chunk_index` de metadata a -2 y -1. Actualizar las queries que leen `_classification` y `_column_mapping` para usar los nuevos índices. |
| `src/pages/CargaDatos.tsx` | Actualizar el health check para excluir `_column_mapping` del conteo (línea 728). |
| `src/hooks/useExtractedData.ts` | Asegurar que el filtro `not('data_category', 'in', ...)` también excluya `_column_mapping` con chunk negativos (ya funciona porque filtra por `data_category`, no por `chunk_index`). |

## Resultado esperado

- Los datos se guardan correctamente sin conflictos.
- El health check reporta el conteo real.
- Dashboard y módulos muestran los datos del archivo.

