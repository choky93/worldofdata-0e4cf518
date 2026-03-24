

# Revisión Completa de World of Data — Bugs y Mejoras Detectados

## Problemas encontrados

### 1. Onboarding redirige a `/` en vez de `/dashboard`
En `Onboarding.tsx` línea 99, `navigate('/')` lleva a la landing. Debería ser `navigate('/dashboard')`.

### 2. Onboarding no pre-carga datos existentes
Si el usuario ya completó el onboarding parcialmente o quiere editarlo desde Configuración, los campos arrancan vacíos. El componente debería leer los datos actuales de `companies` y `company_settings` al montarse.

### 3. Register: branch muerta de verificación de email
En `Register.tsx` línea 35, todavía existe el branch `else` que muestra "Revisá tu email para verificar tu cuenta" y redirige a `/login`. Con auto-confirm activado esto no debería ejecutarse, pero es código confuso. Limpiarlo.

### 4. Edge function `create-employee`: usa `getClaims` que puede no existir
La función usa `anonClient.auth.getClaims(token)` que no es un método estándar del SDK. Debería usar `anonClient.auth.getUser(token)` para validar el JWT.

### 5. Sidebar: badge de alertas hardcodeado
En `AppSidebar.tsx` la sección Alertas tiene `badge: 5` fijo. Debería coincidir con el count real de alertas no leídas (por ahora del mock).

### 6. Dashboard: `mockDailySales` usa `Math.random()` — cambia en cada render
Cada vez que el componente se re-renderiza, los datos del gráfico cambian. Debería usar una seed fija o memoizar los datos.

### 7. Configuración: link a `/onboarding` no pre-carga datos
Cuando el admin va a editar la configuración del onboarding, se pierde lo que ya completó (problema #2).

### 8. `handleDrop` en CargaDatos tiene dependencias faltantes
El `useCallback` para `handleDrop` lista `[user, profile?.company_id]` pero llama a `uploadFiles` que no está memoizada.

---

## Plan de correcciones

### Archivo: `src/pages/Onboarding.tsx`
- Cambiar `navigate('/')` a `navigate('/dashboard')` (línea 99)
- Agregar `useEffect` que cargue datos existentes de `companies` y `company_settings` desde Supabase cuando `profile?.company_id` existe, para pre-llenar el formulario

### Archivo: `src/pages/Register.tsx`
- Eliminar el branch `else` de la línea 35 y simplificar: siempre navegar a `/onboarding` post-signup

### Archivo: `supabase/functions/create-employee/index.ts`
- Reemplazar `anonClient.auth.getClaims(token)` por `anonClient.auth.getUser(token)` para validar el caller

### Archivo: `src/lib/mock-data.ts`
- Convertir `mockDailySales` a valores fijos (sin `Math.random()`) para evitar re-renders inconsistentes

### Archivo: `src/components/AppSidebar.tsx`
- Importar `mockAlerts` y calcular el badge dinámicamente basado en alertas no leídas

### Archivo: `src/pages/CargaDatos.tsx`
- Corregir dependencias del `useCallback` en `handleDrop`

---

## Resumen
Son 6 correcciones concretas que aseguran que el flujo completo funcione de punta a punta: registro → onboarding (con pre-carga si edita) → dashboard → todas las secciones → carga de datos → equipo → configuración.

