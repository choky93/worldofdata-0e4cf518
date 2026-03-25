

# Plan: Revisión y corrección de responsividad móvil/tablet

## Diagnóstico

La captura del cliente muestra la plataforma vista desde un celular. El problema principal: el sidebar colapsado (solo íconos, ~48px) se muestra como elemento permanente en pantallas de ancho >= 768px (breakpoint `md`), robando espacio valioso. En un celular en orientación portrait esto no debería pasar (el sidebar usa Sheet/overlay), pero si el viewport es >= 768px (tablet, celular landscape, o Safari reportando diferente), el sidebar permanente aparece y el contenido se comprime.

Además, los KPIs y el Health Radar usan grids que no se adaptan bien a viewports estrechos (768px-1024px).

## Correcciones a implementar

### 1. Sidebar: ocultar permanente en pantallas < 1024px

**Archivo:** `src/components/ui/sidebar.tsx`

Cambiar el breakpoint del sidebar permanente de `md` (768px) a `lg` (1024px). Esto asegura que en tablets y celulares el sidebar siempre sea un overlay (Sheet), liberando el 100% del ancho para contenido.

- Línea 176: `md:block` → `lg:block`
- Línea 195: `md:flex` → `lg:flex`

**Archivo:** `src/hooks/use-mobile.tsx`

Cambiar `MOBILE_BREAKPOINT` de 768 a 1024 para que coincida con el nuevo breakpoint del sidebar.

### 2. Dashboard: grids responsive mejorados

**Archivo:** `src/pages/Dashboard.tsx`

- Health Radar: `grid-cols-3 lg:grid-cols-6` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`
- KPIs: `grid-cols-2 lg:grid-cols-4` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- KPI values: reducir tamaño en mobile con `text-2xl sm:text-3xl`
- Bottom grid: `lg:grid-cols-2` → `md:grid-cols-2`

### 3. Páginas de secciones: tablas responsive

**Archivos:** `src/pages/Clientes.tsx`, `src/pages/Stock.tsx`, `src/pages/Operaciones.tsx`, `src/pages/Marketing.tsx`

- Envolver tablas en `overflow-x-auto` para scroll horizontal en mobile
- KPI grids: ajustar a `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`

### 4. AppLayout: padding responsive

**Archivo:** `src/components/AppLayout.tsx`

- Main padding: `p-4 lg:p-6` → `p-3 sm:p-4 lg:p-6`

### 5. AICopilot: posición en mobile

**Archivo:** `src/components/AICopilot.tsx`

- Asegurar que el panel de chat no se desborde en mobile (ancho `w-full sm:w-96`)
- FAB: reducir tamaño en mobile

## Detalle técnico

El cambio más impactante es el #1 (sidebar breakpoint). El sidebar de shadcn/ui decide entre Sheet (overlay) y sidebar permanente basándose en `useIsMobile()` que usa `MOBILE_BREAKPOINT`. Al subirlo a 1024px, tablets y celulares siempre verán el sidebar como overlay que se abre/cierra, dando el 100% del ancho al contenido.

