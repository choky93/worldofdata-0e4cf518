

## Análisis

**Sí, se puede implementar — recomiendo en 2 fases.** El documento es claro y autocontenido. Pero hay 3 conflictos con el código actual que requieren decisiones:

### Conflictos detectados

1. **Sidebar actual ≠ Sidebar del doc.** El `AppSidebar.tsx` actual tiene 13 items con condicionales (`has_stock`, `has_ads`), roles (admin/employee), badge de empresa, signOut, y usa el sistema `Sidebar` de shadcn dentro de `AppLayout`. El doc propone un sidebar fijo de 72px con solo 6 items hardcodeados y sin roles.
   - **Decisión:** rediseñar visualmente el `AppSidebar.tsx` existente al estilo nuevo (72px, blanco, íconos minimalistas, activo en negro) **manteniendo los 13 items, roles y signOut**. No crear `src/components/layout/Sidebar.tsx` nuevo.

2. **Topbar vs AppLayout.** El doc asume que Dashboard renderiza Sidebar+Topbar directamente. En el código real, `AppLayout` envuelve todas las páginas con el sidebar y un header con `SidebarTrigger`. Si Dashboard renderiza otro sidebar, queda doble.
   - **Decisión:** crear `Topbar.tsx` y usarlo **dentro** del Dashboard como cabecera de la página (no como reemplazo del layout). El AppLayout sigue dando el sidebar global.

3. **Tema dark global.** `index.html` tiene `class="dark"` y `index.css` está en modo dark-only (memoria visual previa). El doc pide light mode puro.
   - **Decisión:** quitar `class="dark"` del html y reescribir tokens a la paleta pastel. Esto **afectará visualmente todas las otras páginas** (Ventas, Finanzas, etc.) porque comparten los tokens. El doc lo acepta ("rediseño visual del Dashboard… para validar lenguaje visual"), pero el resto de páginas se verán raras hasta rediseñarlas. Confirmado por el doc en "QUÉ DEJAR PARA DESPUÉS".

### Hooks de datos del Dashboard

El Dashboard actual tiene mucha lógica real (`useExtractedData`, `usePeriod`, cálculos de KPIs, ticker, health radar). Las 7 cards nuevas aceptan props con defaults mock. **Mantengo todos los hooks** y conecto los valores reales calculados a las props de las cards donde sea directo (ventas mes, ganancia, ingresos, costos). Donde no haya dato directo (forecast trimestral, ROAS publicitario, donut stock), uso los defaults del doc.

---

## Plan de implementación — 2 fases

### Fase 1 — Tokens, layout y componentes base

1. `index.html` → import Inter, quitar `class="dark"`.
2. `tailwind.config.ts` → agregar fontFamily Inter, radios `2xl`/`3xl`, sombras `soft`/`card`/`card-hover` (mergear con lo existente, no borrar).
3. `src/index.css` → reemplazar tokens `:root` y `.dark` por paleta pastel del doc. Conservar imports de fuentes y la estructura `@layer base/components/utilities`.
4. `src/components/AppSidebar.tsx` → rediseñar visualmente al estilo nuevo (sidebar collapsado 72px, fondo blanco, ícono activo en fondo negro, hover gris, logo "WD" arriba). **Mantener:** los 13 items, lógica de roles, condicionales y signOut.
5. `src/components/AppLayout.tsx` → ajustar header para que sea blanco/claro y combine con el nuevo tema (quitar el border `#1f1f1f`).
6. `src/components/layout/Topbar.tsx` → crear nuevo según doc (breadcrumb, "Hola, {userName}", search/filter/date pill, botón "Crear Reporte").

### Fase 2 — Cards del Dashboard + integración

7. Crear las 7 cards en `src/components/dashboard/`:
   - `ResumenEjecutivoCard.tsx` (fondo negro + glows pastel)
   - `VentasMesCard.tsx` (bar chart, barra max destacada)
   - `GananciaCard.tsx` (número grande + badge margen)
   - `FlujoCajaCard.tsx` (gradiente menta pastel)
   - `ForecastCard.tsx` (línea real + línea proyectada punteada)
   - `StockCard.tsx` (donut 3 estados)
   - `InversionPublicitariaCard.tsx` (2 progress bars)
8. `src/pages/Dashboard.tsx` → reescribir el JSX del return con el grid 4×2 del doc. **Mantener** todos los hooks (`useExtractedData`, `usePeriod`, `useAuth`, cálculos de KPIs). Pasar valores reales como props a las cards (totalMes, ganancia, ingresos, costos, mensajes ejecutivos derivados de `highlights`/alertas existentes). Quitar `<AICopilot>` del flujo no, sigue en `AppLayout`.

### Lo que NO se toca (según doc)

- `useExtractedData`, edge functions, `CargaDatos`, auth, routing.
- Otras páginas (Ventas, Finanzas, etc.) — quedarán visualmente desalineadas hasta rediseño futuro.
- Memoria `mem://style/visual-identity` quedará obsoleta — la actualizo al final para reflejar el nuevo light/pastel.

### Checklist de verificación al final

Pasaré las dos rondas del checklist del doc (código + visual) antes de cerrar.

### Recomendación

Ejecutar **Fase 1 primero** (8 archivos). Vos validás el shell visual (sidebar, topbar, fondo, tipografía). Si te gusta, sigo con **Fase 2** (8 archivos más). Si algo no convence, corregimos antes de hacer las 7 cards.

¿Confirmás arrancar con Fase 1?

