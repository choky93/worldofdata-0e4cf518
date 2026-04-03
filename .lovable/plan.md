

# Plan: Blindaje completo del pipeline de datos

## Resumen

4 mejoras al pipeline: (1) upgrade a GPT-4.1 para clasificación y extracción, (2) tercer nivel de resolución de campos por inferencia contextual, (3) cuarentena inteligente con re-análisis automático por IA, (4) mejor manejo de formatos no soportados con mensajes claros.

## Cambios

### 1. Upgrade a GPT-4.1

**Archivo:** `supabase/functions/process-file/index.ts`

- Línea 247: cambiar `model: "gpt-4o-mini"` → `model: "gpt-4.1"` (clasificación)
- Línea 320: cambiar `model: "gpt-4o"` → `model: "gpt-4.1"` (extracción visual de PDFs/imágenes)
- GPT-4.1 es el modelo más avanzado de OpenAI actualmente: mejor razonamiento, mejor comprensión de tablas, mejor visión

### 2. Tercer nivel de resolución de campos (inferencia contextual)

**Archivo:** `src/lib/field-utils.ts`

Hoy la resolución es: **AI mapping → Keywords → null**. Agregamos un tercer paso antes de devolver null:

- `findNumber`: si no encontró match, buscar la columna con más valores numéricos grandes (probablemente es monto/gasto)
- `findString`: si no encontró match para "nombre", buscar la columna con más valores de texto únicos
- Para fechas: buscar columnas con valores que parezcan fechas (contienen `/`, `-`, nombres de meses)

Esto se activa SOLO cuando los dos primeros niveles fallan. Es un "último recurso inteligente" que analiza los datos reales en vez de los nombres de columnas.

### 3. Cuarentena inteligente con re-análisis automático

**Archivo:** `supabase/functions/process-file/index.ts`

Después de la clasificación (paso 1 del procesamiento tabular), verificar calidad del mapping:

```text
Verificar:
- ¿El column_mapping tiene al menos 1 campo de monto/gasto/precio mapeado?
- ¿Tiene al menos 1 campo de fecha mapeado?

Si AMBOS son null → Cuarentena:
  1. Hacer una SEGUNDA llamada a GPT-4.1 con un prompt más detallado y permisivo
  2. Si la segunda llamada logra mapear → usar ese resultado
  3. Si sigue sin mapear → guardar datos igual, marcar status='review',
     guardar processing_error="Requiere revisión: no se detectaron campos clave"
```

**Archivo:** `src/pages/CargaDatos.tsx`

- En la lista de archivos, mostrar los que tienen `status='review'` con un badge naranja "Pendiente de revisión"
- Mostrar el mensaje de `processing_error` para que el admin sepa qué pasó
- No se pierden datos: los datos se guardan igual, solo se marca que necesitan atención

### 4. Manejo de formatos no soportados

**Archivo:** `src/pages/CargaDatos.tsx`

- Antes de subir, validar extensión del archivo
- Si no es `.xlsx`, `.xls`, `.csv`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.doc`, `.docx`, `.xml` → mostrar toast de error claro:
  - "Formato no soportado: .ods. Los formatos aceptados son: Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), Imágenes (.png, .jpg), Word (.doc, .docx) y XML (.xml)"
- En la UI de carga, mostrar los formatos aceptados debajo del área de drag & drop

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/process-file/index.ts` | GPT-4.1 + lógica de cuarentena con re-análisis |
| `src/lib/field-utils.ts` | Tercer nivel de inferencia contextual |
| `src/pages/CargaDatos.tsx` | Validación de formatos + UI de cuarentena |

