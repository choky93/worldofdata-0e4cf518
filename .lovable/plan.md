

# Fix: Recursión infinita en RLS de `profiles`

## Problema

Las políticas "Admins can view company profiles" y "Admins can update company profiles" en la tabla `profiles` hacen un subquery a la misma tabla `profiles`:

```sql
company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
```

Esto genera recursión infinita. El mismo patrón afecta a **otras tablas** que también hacen subquery a `profiles`: `companies`, `company_settings`, `diagnostic_results`, `file_uploads`.

## Solución

### Paso 1: Crear función `get_user_company_id()` SECURITY DEFINER

```sql
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_company_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_company_id TO authenticated;
```

### Paso 2: Reemplazar políticas en `profiles`

Drop y recrear las 2 políticas problemáticas usando `get_user_company_id()`:

- **Admins can view company profiles** → `USING (company_id = get_user_company_id() AND has_role(auth.uid(), 'admin'))`
- **Admins can update company profiles** → mismo cambio

### Paso 3: Corregir políticas en otras tablas (mismo patrón)

Reemplazar `company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())` por `company_id = public.get_user_company_id()` en:

- **companies** (2 políticas: SELECT, UPDATE)
- **company_settings** (2 políticas: SELECT, UPDATE)
- **diagnostic_results** (3 políticas: ALL admin, SELECT users)
- **file_uploads** (1 política: SELECT "Users can view own uploads")

Total: **1 migración** con la función + drop/recreate de ~9 políticas.

## Archivos tocados
- Solo migración SQL (sin cambios en código frontend)

