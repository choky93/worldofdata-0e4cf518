

# Plan: Implementar funcionalidades pendientes de World of Data

## Lo que ya está implementado
- Auth (registro, login, roles, reset password)
- Onboarding conversacional con 4 bloques + resumen
- Dashboard con datos mock de Star Impresiones 3D
- Sidebar con navegación condicional
- Landing page interactiva
- Todas las secciones con datos mock (Ventas, Finanzas, Stock, Clientes, Forecast, Alertas, Métricas, Marketing, Operaciones)
- Carga de datos con drag & drop (solo UI mock)
- Equipo (solo UI mock)
- Configuración

## Lo que falta implementar

### Fase 1 — Carga de datos real (Supabase Storage)
Conectar el drag & drop de `/carga-datos` con Supabase Storage para que los archivos se suban de verdad al bucket `uploads` y se registren en la tabla `file_uploads`. Mostrar historial real desde la base de datos. Empleados solo ven sus propias cargas.

**Archivos a modificar:** `src/pages/CargaDatos.tsx`
**Cambios DB:** Ninguno (tabla `file_uploads` y bucket `uploads` ya existen)

### Fase 2 — Gestión de equipo real
Implementar la creación real de empleados: el admin ingresa nombre + email, se crea la cuenta con `supabase.auth.admin` via edge function, se asigna rol `employee` y se asocia a la misma `company_id`. Listar empleados reales desde `profiles` + `user_roles`. Activar/desactivar cuentas.

**Archivos a modificar:** `src/pages/Equipo.tsx`
**Nuevos archivos:** Edge function `supabase/functions/create-employee/index.ts`
**Cambios DB:** Agregar columna `active` a `profiles` (default true)

### Fase 3 — Barra resumen inteligente (ticker rotativo)
El dashboard tiene highlights estáticos. Implementar un ticker animado que rote entre los highlights con transición suave (fade o slide), estilo marquee corporativo.

**Archivos a modificar:** `src/pages/Dashboard.tsx`

### Fase 4 — Mejoras al Dashboard
- Agregar enlace "Ver sugerencia →" en las alertas del dashboard (ya están las alertas pero sin el botón ghost de acción)
- Gráficos con gradient fill en áreas (actualmente son planos)
- Línea de proyección con `stroke-dasharray` en el gráfico de ventas diarias

**Archivos a modificar:** `src/pages/Dashboard.tsx`

### Fase 5 — Secciones más completas

**Clientes:** Agregar tabla de clientes con nivel de compra, frecuencia, última compra. Indicador de clientes en riesgo de churn.

**Stock:** Agregar tabla de productos con estado (OK/Faltante/Sobrestock), días de cobertura, alerta de reposición.

**Operaciones:** Agregar registro de compras y ventas grandes con tabla y filtros básicos.

**Métricas:** Agregar gráficos de evolución temporal con flechas de tendencia (ventas, margen, flujo, stock).

**Marketing:** Agregar gráficos de rendimiento por campaña además de la tabla actual.

**Archivos a modificar:** Los respectivos archivos en `src/pages/`

### Fase 6 — Asistente lateral en Carga de datos
Panel lateral colapsable que guía al usuario sobre qué archivos cargar según su configuración de onboarding. Si vende productos → "Subí tu lista de stock". Si usa Meta Ads → "Subí tu reporte de Meta".

**Archivos a modificar:** `src/pages/CargaDatos.tsx`

### Fase 7 — UX y diseño refinado
- Cards sin bordes sólidos, sombras por capas
- Tooltips en métricas técnicas (ROAS, margen bruto, etc.) — parcialmente hecho, completar en todas las secciones
- Alertas con borde izquierdo de color por tipo
- Formato argentino consistente en todas las páginas (ya está el helper, verificar uso)

**Archivos a modificar:** Varios en `src/pages/` y `src/index.css`

---

## Orden de ejecución sugerido
Dado el volumen, sugiero implementar en 3 rondas:

1. **Ronda 1** (Fases 1 + 2): Backend real — carga de archivos y gestión de equipo funcional
2. **Ronda 2** (Fases 3 + 4 + 5): Dashboard mejorado y secciones más ricas
3. **Ronda 3** (Fases 6 + 7): Asistente contextual y pulido de UX

Cada ronda es un mensaje de implementación. ¿Aprobás el plan para arrancar con la Ronda 1?

