import { formatCurrency } from '@/lib/formatters';

interface GananciaCardProps {
  ganancia: number | null;
  margenPct: number | null;
}

export function GananciaCard({ ganancia, margenPct }: GananciaCardProps) {
  const isPositive = (ganancia ?? 0) >= 0;
  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px] flex flex-col justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Ganancia neta
        </p>
        <h3 className="text-4xl font-bold text-foreground tracking-tight">
          {ganancia !== null ? formatCurrency(ganancia) : '—'}
        </h3>
      </div>

      <div className="mt-4">
        {margenPct !== null && (
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: isPositive ? 'hsl(var(--pastel-mint))' : 'hsl(var(--pastel-peach))',
              color: 'hsl(var(--foreground))',
            }}
          >
            {isPositive ? '↑' : '↓'} Margen {margenPct.toFixed(1)}%
          </span>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Ventas menos gastos del período
        </p>
      </div>
    </div>
  );
}
