

# Rediseño Visual Completo — Dark Theme Lima/Verde

## Resumen
Cambiar toda la estética de la plataforma a un tema dark con acento amarillo-lima (#c8f135), sin modificar lógica, hooks ni estructura de datos. Solo CSS, colores, tipografía y clases de Tailwind.

## Archivos a modificar

### 1. `src/index.css` — Variables CSS y clases utilitarias
- Reemplazar todas las CSS variables (`:root` y `.dark`) con la nueva paleta oscura
- Background: `#0d0d0d`, card: `#1a1a1a`, border: `#2a2a2a`
- Primary: `#c8f135`, success: `#4ade80`, destructive: `#f87171`
- Texto: `#f5f5f5` (principal), `#888888` (secundario), `#555555` (terciario)
- Sidebar: fondo `#111111`, border `#1f1f1f`, active `#1f2a0f`
- Reemplazar `.sidebar-gradient` con fondo plano `#111111`
- Nuevas clases para alertas: `.alert-warning`, `.alert-error`, `.alert-success`, `.alert-info` con fondos/bordes oscuros específicos
- Actualizar shadow tokens a valores para tema oscuro
- Eliminar modo claro — todo es dark por defecto

### 2. `src/components/ui/card.tsx` — Estilo base de cards
- Cambiar clases por defecto: `bg-[#1a1a1a] border-[#2a2a2a] rounded-xl`
- Eliminar backdrop-blur y sombras, solo bordes sutiles
- CardTitle: `text-xs font-medium text-[#888888] uppercase tracking-widest` para labels

### 3. `src/components/ui/button.tsx` — Botones
- Primario: `bg-[#c8f135] text-[#0d0d0d] font-semibold rounded-lg`
- Secundario: transparente con `border-[#2a2a2a] text-[#f5f5f5]`
- Destructivo: `bg-[#2a0a0a] text-[#f87171] border-[#4a1010]`

### 4. `src/components/ui/badge.tsx` — Badges
- `rounded-full` (ya está), ajustar colores para tema dark

### 5. `src/components/ui/table.tsx` — Tablas
- Filas alternas: `#141414` y `#111111`
- Header: `text-[#555555] uppercase text-xs tracking-widest`
- Bordes: `border-b border-[#1f1f1f]`
- Hover: `bg-[#1f2a0f]`

### 6. `src/components/PeriodFilter.tsx` — Selector de período como pills
- Reemplazar dropdown por pill buttons horizontales
- Inactivo: `bg-[#1a1a1a] border-[#2a2a2a] text-[#666666]`
- Activo: `bg-[#c8f135] text-[#0d0d0d]`

### 7. `src/components/AppSidebar.tsx` — Sidebar
- Item inactivo: `text-[#666666]`
- Item activo: `bg-[#1f2a0f] text-[#c8f135]`
- Logo con acento lima

### 8. `src/components/AppLayout.tsx` — Header
- Fondo `#0d0d0d`, border bottom `#1f1f1f`

### 9. `src/pages/Dashboard.tsx` — Dashboard completo
- KPI cards con nuevo estilo (label uppercase, número blanco grande)
- Card destacada (primera) con fondo `#c8f135` y texto `#0d0d0d`
- Gráfico: gradiente barras `#c8f135` → `#4ade80`, grid `#1f1f1f`, ejes `#555555`
- Tooltip: fondo `#1a1a1a`, border `#2a2a2a`, números en `#c8f135`
- Alertas con estilos dark específicos (warning: `#2a1f00`, etc.)
- Header del módulo con separador `border-b border-[#1f1f1f]`

### 10-16. Todos los módulos (Ventas, Marketing, Finanzas, Clientes, Forecast, Alertas, Metricas, Operaciones, Stock, CargaDatos)
- Aplicar mismo patrón de header: título izq + pills derecha + badge verde
- KPI cards con label uppercase + número blanco
- Gráficos con paleta lima/verde
- Tablas con filas alternas y hover verde oscuro
- Separador bajo header

### 17. `src/components/AICopilot.tsx` — Copilot flotante
- Adaptar colores al nuevo tema dark

### 18. `src/components/ui/sidebar.tsx` — Base sidebar
- Ajustar variables de color del sidebar

### 19. `index.html` — Forzar dark
- Agregar `class="dark"` al `<html>` tag para asegurar tema oscuro

## Notas técnicas
- Se eliminará el modo claro — la app será dark-only
- Los colores se definirán tanto como CSS variables (para componentes shadcn) como clases directas de Tailwind donde sea necesario
- No se tocan: hooks, contextos, edge functions, lógica de datos, estructura de rutas
- La fuente Inter ya está importada y configurada
- Los gráficos de Recharts se estilizarán inline con los nuevos colores

