

# Plan: Mejoras basadas en feedback del cliente + documentos estratégicos

## Resumen del feedback del cliente

El cliente tiene 3 grandes ejes de insatisfacción:

1. **Dashboard demasiado básico y "cuadradito"** — poca info visible en pantalla, sidebar ocupa mucho espacio, hay que scrollear para ver la salud del negocio. Quiere ver todo de un vistazo.
2. **Diseño genérico** — se ve como "cualquier plataforma de gestión". Quiere algo visualmente diferenciado y más impactante.
3. **Onboarding actual demasiado operativo** — los documentos proponen un diagnóstico estratégico tipo "¿dónde te duele?" con scoring de madurez empresarial (Reactiva / Desordenada / Dependiente / Escalable), no solo preguntas sobre productos y stock.

Además, los documentos aportan conceptos clave:
- **"CEO Operating System"**: no dashboards, sino respuestas a preguntas de negocio
- **Radar de salud** con semáforo (🟢🟡🔴) por dimensión
- **Diagnóstico estratégico** con 5-7 bloques temáticos y resultado automático
- **Copiloto IA conversacional** (para futuro, pero la estructura debe estar)

---

## Cambios a implementar

### Fase A — Rediseño del Dashboard ("ver todo en una pantalla")

**Problema**: El dashboard actual tiene 3 KPI cards grandes + gráfico + secciones debajo que requieren scroll. El sidebar ocupa ~20% del ancho.

**Solución**:
1. **Layout del sidebar**: Que arranque colapsado por defecto en desktop (solo íconos, ~60px). El usuario puede expandirlo. Esto libera espacio horizontal.
2. **Radar de Salud del Negocio** (nueva sección hero): Un componente visual tipo "health bar" o "semáforo" que muestre el estado de cada dimensión (Ventas, Finanzas, Stock, Clientes, Marketing, Operaciones) con indicadores 🟢🟡🔴 en una sola fila. Click en cada uno navega a la sección.
3. **KPIs en grid más compacto**: Pasar de 3 cards grandes a una grilla de 4-6 KPIs compactos (número + tendencia + mini-sparkline) que quepan en una fila.
4. **Gráfico principal más prominente**: El gráfico de ventas diarias con más altura y mejor aprovechamiento del ancho.
5. **Panel de "Decisiones del día"**: Reemplazar las alertas estáticas por un bloque que diga "Hoy deberías..." con 2-3 acciones concretas priorizadas.

**Archivos**: `src/pages/Dashboard.tsx`, `src/components/AppSidebar.tsx`, `src/components/AppLayout.tsx`

### Fase B — Nuevo Onboarding Estratégico (Diagnóstico CEO)

Reemplazar el onboarding actual (operativo: nombre, rubro, stock) con el diagnóstico estratégico de los documentos del cliente. El onboarding operativo pasa a ser un paso secundario.

**Nuevo flujo**:
1. **Bloque 1 — "¿Dónde te duele hoy?"**: Una sola pregunta estratégica con 6 opciones (del documento BSC). Segmenta la dimensión dominante.
2. **Bloque 2 — Nivel de madurez**: 2-3 preguntas rápidas (cómo tomás decisiones, sabés tu margen, soportás duplicar ventas).
3. **Bloque 3 — Datos del negocio**: Las preguntas operativas actuales (nombre, rubro, stock, ads) — compactadas.
4. **Bloque 4 — Objetivos**: Multi-selección actual.
5. **Resultado**: Pantalla de resultado con clasificación (Empresa Reactiva / En Transición / Ordenada / Escalable) + potencial de mejora + 3 indicadores prioritarios desbloqueados.

**Gamificación sutil**: "Tu empresa tiene un potencial de mejora del X% en rentabilidad en 6 meses" + desbloqueo visual del mapa estratégico.

**Archivos**: `src/pages/Onboarding.tsx`, `src/lib/constants.ts`, posible migración DB para guardar resultado del diagnóstico.

### Fase C — Diseño diferenciado

El cliente dice que se ve "como cualquier plataforma de gestión". Necesitamos un salto visual.

1. **Sidebar oscuro con gradiente sutil**: En lugar de flat dark, un gradiente muy sutil de navy a casi-negro.
2. **Cards con glassmorphism sutil**: Background semi-transparente con blur en lugar de cards blancas planas.
3. **Acentos de color por módulo**: Cada sección tiene un color de acento propio (Ventas=azul, Finanzas=verde, Stock=naranja, etc.) que se refleja en el borde superior de las cards y los íconos.
4. **Tipografía más bold en números**: Los KPIs con font-weight 800 y tamaño más grande para impacto visual.
5. **Animaciones de entrada escalonadas**: Cards aparecen con fade-in escalonado al cargar el dashboard.
6. **Header minimal**: Reducir el header a lo mínimo (sin barra separadora gruesa).

**Archivos**: `src/index.css`, `tailwind.config.ts`, `src/components/ui/card.tsx`, `src/components/AppLayout.tsx`, `src/pages/Dashboard.tsx`

### Fase D — Preparación del Copiloto IA (estructura)

No implementar IA real todavía, pero dejar la estructura lista:
1. **Botón flotante "Preguntale a WOD"** en la esquina inferior derecha del dashboard.
2. **Panel lateral de chat** que se abre con animación slide-in.
3. **Mensajes placeholder**: "Pronto vas a poder preguntarme cosas como: ¿Por qué bajaron las ventas? ¿Qué producto debería empujar? ¿Qué cliente estoy perdiendo?"
4. Esto muestra la visión del producto sin necesitar el motor de IA todavía.

**Archivos**: Nuevo componente `src/components/AICopilot.tsx`, modificar `src/components/AppLayout.tsx`

### Fase E — Módulo de Registro Operativo Interno

Del documento `resumen_conversacion_ceo_plataforma.pdf`: módulo para registrar la "realidad económica" (ingresos/egresos no facturados) separada de lo fiscal.

1. **Nueva sección "Bitácora Operativa"** accesible desde el sidebar (o sub-sección de Finanzas).
2. **Registro rápido**: tipo (ingreso/egreso), monto, categoría, nota. Acceso restringido solo al admin.
3. **Vista dual en Finanzas**: "Realidad fiscal" vs "Realidad operativa" como tabs.

**Archivos**: Nueva página o sub-tab en `src/pages/Finanzas.tsx`, posible migración DB.

---

## Orden de ejecución sugerido

1. **Ronda 1**: Fase A (Dashboard) + Fase C (Diseño) — el impacto visual inmediato que el cliente pide
2. **Ronda 2**: Fase B (Onboarding estratégico) — rediseño del diagnóstico
3. **Ronda 3**: Fase D (Copiloto IA placeholder) + Fase E (Bitácora operativa)

## Detalles técnicos

- **DB**: Nueva tabla `diagnostic_results` (company_id, classification, scores_json, potential_improvement_pct, priority_indicators)
- **Sidebar colapsado**: Cambiar `defaultOpen` en `SidebarProvider` y ajustar `AppLayout`
- **Glassmorphism**: CSS con `backdrop-filter: blur(12px)` + `background: hsl(var(--card) / 0.7)`
- **Colores por módulo**: Variables CSS o constante en `constants.ts` mapeando sección → color de acento
- **Copiloto**: Componente con `position: fixed`, `z-index: 50`, animación con framer-motion

