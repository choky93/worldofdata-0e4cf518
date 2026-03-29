

# Fix: Eliminar migración duplicada del push de GitHub

## Situación actual

El proyecto **compila y funciona correctamente** — la preview muestra la landing page sin errores de build. El "Preview failed" fue probablemente un error transitorio durante la sincronización del push de GitHub.

Sin embargo, hay un problema pendiente: existe una **migración duplicada** que llegó desde GitHub:

- `20260329000001_add_next_chunk_index.sql` (del push de GitHub) — contiene el `ALTER TABLE` + una query `DELETE` para limpiar duplicados
- `20260329140807_c89a7fdf-...sql` (creada por Lovable) — contiene solo el `ALTER TABLE`

Ambas usan `IF NOT EXISTS`, así que no crashean, pero la migración de GitHub tiene una query `DELETE` que podría generar conflictos si se re-ejecuta.

## Plan

### 1. Eliminar la migración duplicada de GitHub
- Borrar `supabase/migrations/20260329000001_add_next_chunk_index.sql`
- La migración de Lovable (`20260329140807_c89a7fdf-...`) ya cubre la columna `next_chunk_index`

### 2. Verificar que todo sigue compilando
- No se requieren otros cambios — el código actual compila correctamente

## Detalle técnico

La única acción es borrar un archivo SQL redundante. No hay errores de TypeScript, imports rotos, ni problemas de compilación en el código actual. Los warnings de consola (`forwardRef`) son advertencias estándar de React que no afectan la funcionalidad.

