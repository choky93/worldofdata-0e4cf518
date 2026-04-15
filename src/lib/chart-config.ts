// src/lib/chart-config.ts
// Configuración global para todos los gráficos Recharts

export const CHART_COLORS = {
  accent:    '#c8f135',
  positive:  '#4ade80',
  negative:  '#f87171',
  warning:   '#fbbf24',
  info:      '#60a5fa',
  muted:     '#333333',
  grid:      '#1a1a1a',
  axis:      '#444444',
};

// Formatea fechas para el eje X — "Nov 23", "Ene 24", etc.
export function formatXAxisDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    .replace(/\./g, '')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

// Formatea montos: $5.200.000 → "$5,2M" o "$5.200k"
export function formatAmount(value: number): string {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M';
  if (value >= 1_000) return '$' + (value / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + 'k';
  return `$${value.toLocaleString('es-AR')}`;
}

// Formatea montos completos para tooltips
export function formatAmountFull(value: number): string {
  return `$${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

// Props comunes para todos los <BarChart> y <LineChart>
export const CHART_CONTAINER_STYLE: React.CSSProperties = {
  background: '#0f0f0f',
  borderRadius: '10px',
  padding: '4px 0 0 0',
};

// Estilos para el tooltip customizado
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '10px 14px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#f0f0f0',
  },
  labelStyle: {
    color: '#888',
    fontSize: '11px',
    marginBottom: '4px',
    fontWeight: 500,
  },
  itemStyle: {
    color: '#c8f135',
    fontWeight: 600,
    fontFamily: "'DM Mono', monospace",
  },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

// Estilos para el eje
export const AXIS_STYLE = {
  tick: {
    fill: '#444',
    fontSize: 11,
    fontFamily: "'DM Sans', sans-serif",
  },
};
