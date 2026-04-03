

# Plan: Limpiar datos existentes y probar pipeline

## Estado actual

Hay 1 empresa (`de5e88bd-...`) con 2 archivos:
- `Informe ventas mensuales .xls` → 26 filas de ventas
- `Informe-sin-título-mar-1-2026-al-mar-30-2026.csv` → 6 filas de marketing

Ambos con status `processed` pero sin el nuevo mapeo inteligente (fueron procesados antes de implementarlo).

## Cambios

### 1. Limpiar datos de todas las cuentas

Ejecutar 3 operaciones SQL via la herramienta de inserción/borrado:

1. `DELETE FROM file_extracted_data` — eliminar todos los datos extraídos
2. `DELETE FROM file_uploads` — eliminar todos los registros de archivos
3. Eliminar los archivos físicos de R2 (storage) llamando a la edge function `r2-delete` para cada `storage_path`

Esto deja las cuentas completamente limpias, sin archivos ni datos.

### 2. Probar el pipeline

Después de limpiar, probar subiendo un archivo desde la UI para verificar que:
- La clasificación con GPT-4.1 funciona
- El `column_mapping` se genera y guarda correctamente
- Los datos aparecen en el módulo correcto

## Archivos a modificar

Ninguno — son operaciones de datos y pruebas, no cambios de código.

