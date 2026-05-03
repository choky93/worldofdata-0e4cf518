// src/lib/chart-config.ts
// Configuración global Recharts — tema light pastel
// Los strings hsl(var(--token)) son resueltos en runtime por el browser
// dentro de SVG (Recharts pasa fill/stroke como atributo).

export const CHART_COLORS = {
  accent:    'hsl(var(--primary))',
  positive:  'hsl(var(--success))',
  negative:  'hsl(var(--destructive))',
  warning:   'hsl(var(--pastel-peach-strong))',
  info:      'hsl(var(--pastel-sky-strong))',
  muted:     'hsl(var(--muted-foreground))',
  grid:      'hsl(var(--border))',
  axis:      'hsl(var(--muted-foreground))',
};

export function formatXAxisDate(value: string | number | Date): string {
  if (value === null || value === undefined || value === '') return '';
  // Si ya viene formateado tipo "Ene 26" / "ene 2026" / cualquier label no-fecha,
  // devolverlo tal cual (evita "Invalid Date" en el eje).
  if (typeof value === 'string') {
    // YYYY-MM o YYYY-MM-DD → parsear como UTC para evitar shift de timezone
    const ymdMatch = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d ?? '01')));
      return dt.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
        .replace(/\./g, '')
        .replace(/^\w/, c => c.toUpperCase())
        .trim();
    }
    // Si no parece ISO, devolver tal cual (ya viene legible).
    if (!/^\d{4}-\d{2}/.test(value) && !/^\d{4}\/\d{2}/.test(value)) {
      return value;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    .replace(/\./g, '')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

export function formatAmount(value: number): string {
  if (value >= 1_000_000) return '$' + (value / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M';
  if (value >= 1_000) return '$' + (value / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + 'k';
  return `$${value.toLocaleString('es-AR')}`;
}

export function formatAmountFull(value: number): string {
  return `$${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export const CHART_CONTAINER_STYLE: React.CSSProperties = {
  background: 'hsl(var(--card))',
  borderRadius: '12px',
  padding: '4px 0 0 0',
};

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '10px',
    padding: '10px 14px',
    boxShadow: 'var(--shadow-card-hover)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: 'hsl(var(--foreground))',
  },
  labelStyle: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: '11px',
    marginBottom: '4px',
    fontWeight: 500,
  },
  itemStyle: {
    color: 'hsl(var(--foreground))',
    fontWeight: 600,
    fontFamily: "'DM Mono', monospace",
  },
  cursor: { fill: 'hsl(var(--muted) / 0.5)' },
};

export const AXIS_STYLE = {
  tick: {
    fill: 'hsl(var(--muted-foreground))',
    fontSize: 11,
    fontFamily: "'DM Sans', sans-serif",
  },
};
