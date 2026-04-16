

## Auditoría — qué quedó mal

Hice grep de colores hardcoded oscuros (`#1a1a1a`, `#1f1f1f`, `bg-[#...]`, `text-[#666]`, `border-[#...]`) y **encontré 30 ocurrencias residuales en 8 archivos de páginas/componentes funcionales**, más un problema estructural grave en `KPICard`. La Fase 1 cambió tokens globales pero las páginas internas seguían con colores absolutos del tema dark anterior, por eso se ven rotas.

### Hallazgos concretos

1. **`KPICard.tsx` — el más grave (esto es lo que ves como "fichas rectangulares con puntas" en Ventas/Métricas)**
   Usa CSS vars que **ya no existen**: `--bg-card`, `--border-default`, `--shadow-card`, `--text-primary`, `--text-secondary`, `--radius-lg`, `--font-sans`, `--font-mono`, `--positive-dim`, `--negative-dim`, `--accent-glow`. Como los styles inline fallan a `undefined`, el navegador renderiza un div sin fondo, sin borde, sin radius → caja rectangular blanca/transparente con esquinas en pico. Y el "accent" verde lima (`#d4f73a`) ya no combina con el pastel.

2. **`Ventas.tsx`** — Tooltip custom con `background: '#1a1a1a'`, `color: '#666'` (cuadro negro flotando sobre fondo claro). Charts con `stroke="#1a1a1a"` (líneas de grilla negras gruesas). 

3. **`Marketing.tsx`** — `CartesianGrid stroke="#1f1f1f"` (grilla negra).

4. **`Forecast.tsx`, `Metricas.tsx`, `Clientes.tsx`** — varios `stroke="#1a1a1a"` y posibles tooltips/badges con colores oscuros.

5. **`Finanzas.tsx`** — banner de Bitácora con `bg-[#1f2a0f] border-[#2a3a1a]` (verde militar oscuro, residuo del tema dark previo).

6. **`AICopilot.tsx`** — drawer con `border-[#1f1f1f]`, chips con `bg-[#1a1a1a]`, badges modo con `bg-[#1f2a0f]`. El drawer queda con bordes negros sobre fondo claro.

7. **`PeriodFilter.tsx`** — `hover:border-[#3a3a3a]` (hover invisible en light).

8. **`ResumenEjecutivoCard.tsx`** — gradient hardcodeado `#0f0f0f → #1a1a1a`. Esto **es intencional** según el doc original ("fondo negro con glows pastel"), pero conviene tokenizarlo a `hsl(var(--accent))` para que sea consistente y se pueda ajustar.

9. **`Operaciones.tsx`** — revisado y **está OK** (usa `Card`, `text-muted-foreground`, `alert-success`). Lo que ves como "fondo negro horrible" muy probablemente sea **el AICopilot drawer abierto encima** (por sus bordes/chips negros del punto 6) o el `ResumenEjecutivoCard` si se filtró a otra vista. Si después del fix seguís viendo negro, hago un screenshot para confirmar.

10. **Componentes shadcn (`alert-dialog`, `dialog`, `drawer`, `sheet`)** — usan `bg-black/80` para overlays. Esto es **correcto y estándar** para modales (se ven igual en light y dark). **No tocar.**

11. **`button.tsx`, `table.tsx`** — los matches son cosas tipo `data-[state=...]` o `border-[1px]` (no son colores). **No tocar.**

---

## Plan de corrección — 1 fase, ~7 archivos

### Cambios

1. **`src/components/ui/KPICard.tsx`** — reescribir completo migrando a Tailwind + tokens semánticos. Mantener exactamente la misma API de props (`label`, `value`, `subtext`, `trend`, `accent`, `icon`, `onClick`, `className`). Card en `bg-card border-border rounded-2xl shadow-card`, accent en `bg-accent text-accent-foreground` (negro pastel del nuevo tema, no lima). TrendBadge con `bg-success/15 text-success` y `bg-destructive/15 text-destructive`.

2. **`src/pages/Ventas.tsx`** — Tooltip custom: `background: hsl(var(--card))`, borde `hsl(var(--border))`, texto `hsl(var(--foreground))` y `hsl(var(--muted-foreground))`, sombra `var(--shadow-card)`. Cambiar `stroke="#1a1a1a"` a `stroke="hsl(var(--border))"`.

3. **`src/pages/Marketing.tsx`** — `stroke="#1f1f1f"` → `stroke="hsl(var(--border))"`.

4. **`src/pages/Forecast.tsx`, `Metricas.tsx`, `Clientes.tsx`** — buscar y reemplazar todos los `stroke="#1a1a1a"`, `#1f1f1f`, `#666` por tokens (`hsl(var(--border))`, `hsl(var(--muted-foreground))`).

5. **`src/pages/Finanzas.tsx`** — banner Bitácora: `bg-[#1f2a0f] border-[#2a3a1a]` → `bg-pastel-mint/40 border-border` (suave, en línea con el resto).

6. **`src/components/AICopilot.tsx`** — todos los `border-[#1f1f1f]` → `border-border`. Chips `bg-[#1a1a1a] border-[#2a2a2a]` → `bg-muted border-border`. Badges modo activo `bg-[#1f2a0f]` → `bg-primary/30`. El círculo del icono `bg-[#1f2a0f]` → `bg-primary/20`.

7. **`src/components/PeriodFilter.tsx`** — `hover:border-[#3a3a3a]` → `hover:border-foreground/30`.

8. **`src/components/dashboard/ResumenEjecutivoCard.tsx`** — el negro queda (es intencional) pero lo migro a `hsl(var(--accent))` con gradiente sutil para que sea coherente con el sistema.

### Lo que NO se toca

- `Operaciones.tsx` (ya está bien, espero validación visual después del fix de AICopilot).
- Overlays de shadcn (`bg-black/80` es correcto).
- Lógica de datos, hooks, edge functions.
- `chart-config.ts` ya parece estar bien — verifico `TOOLTIP_STYLE` y `AXIS_STYLE` y si tienen colores oscuros, los actualizo también.

### Después del fix

Te pido confirmación visual de Operaciones específicamente — si tras corregir AICopilot/KPICard seguís viendo "fondo negro", hago screenshot del preview para identificar el origen exacto.

