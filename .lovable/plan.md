

# Notificaciones de error en carga + contexto de errores para el copiloto

## Problema actual

1. **Sin notificación activa**: Cuando un archivo falla durante el procesamiento en background, el usuario solo se entera si mira la lista de archivos. No hay toast ni alerta visible.
2. **El copiloto no sabe de errores**: `ai-chat` solo consulta `file_extracted_data` — no tiene acceso a `file_uploads`, así que no puede informar sobre archivos fallidos ni explicar por qué.

## Plan

### 1. Toast automático cuando el polling detecta un nuevo error

En `CargaDatos.tsx`, dentro del polling que corre cada 5 segundos:
- Guardar un `Set` de IDs de archivos que ya estaban en error
- Comparar en cada fetch: si aparece un nuevo archivo con `status = 'error'`, mostrar un `toast.error` con el nombre del archivo y el motivo (`processing_error`)
- Esto da feedback inmediato sin que el usuario tenga que buscar en la lista

### 2. Mostrar error completo en la UI (no truncado)

En la lista de archivos, cambiar el `<p className="truncate">` del error por un tooltip o un texto expandible, para que el usuario pueda leer el motivo completo del fallo.

### 3. Dar contexto de errores de carga al copiloto

En `supabase/functions/ai-chat/index.ts`, dentro de `fetchCompanyContext`:
- Agregar una consulta a `file_uploads` filtrando por `status = 'error'` y la `company_id`
- Incluir `file_name`, `processing_error`, `file_type` y `created_at` en el contexto
- Esto permite que el copiloto responda preguntas como "¿por qué falló mi archivo?" con información real

## Archivos a modificar

- `src/pages/CargaDatos.tsx` — toast en polling + error expandible
- `supabase/functions/ai-chat/index.ts` — consulta de `file_uploads` con errores

## Detalle técnico

**CargaDatos.tsx — detección de nuevos errores:**
```typescript
const prevErrorIdsRef = useRef<Set<string>>(new Set());

// Dentro de fetchFiles, después de obtener los archivos:
const currentErrorIds = new Set(files.filter(f => f.status === 'error').map(f => f.id));
for (const f of files) {
  if (f.status === 'error' && !prevErrorIdsRef.current.has(f.id)) {
    toast.error(`Error procesando "${f.file_name}"`, {
      description: f.processing_error || 'Error desconocido',
      duration: 8000,
    });
  }
}
prevErrorIdsRef.current = currentErrorIds;
```

**ai-chat/index.ts — contexto de archivos fallidos:**
```typescript
const { data: failedFiles } = await sb
  .from("file_uploads")
  .select("file_name, file_type, processing_error, created_at")
  .eq("company_id", companyId)
  .eq("status", "error")
  .order("created_at", { ascending: false })
  .limit(10);

if (failedFiles?.length) {
  parts.push("\n=== ARCHIVOS CON ERROR DE PROCESAMIENTO ===");
  for (const f of failedFiles) {
    parts.push(`- "${f.file_name}" (${f.file_type}): ${f.processing_error || "sin detalle"}`);
  }
}
```

