import { TrendingUp } from 'lucide-react';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';

interface GananciaCardProps {
  ganancia: number | null;
  margenPct: number | null;
  ingresos?: number | null;
  costos?: number | null;
}

export function GananciaCard({ ganancia, margenPct, ingresos, costos }: GananciaCardProps) {
  const hasData = ganancia !== null && ganancia !== undefined && !isNaN(ganancia);
  const isPositive = (ganancia ?? 0) >= 0;

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px] flex flex-col justify-between">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Ganancia neta
        </p>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <TrendingUp className="w-8 h-8 opacity-40" strokeWidth={1.5} />
          <span className="text-xs">Ventas menos gastos del período</span>
        </div>
      ) : (
        <>
          <div>
            <h3
              className="font-bold text-foreground tracking-tight mb-3 truncate"
              style={{ fontSize: 'clamp(20px, 3vw, 36px)' }}
              title={formatCurrency(ganancia!)}
            >
              {formatCurrencyCompact(ganancia!)}
            </h3>
            {margenPct !== null && margenPct !== undefined && !isNaN(margenPct) && (
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
          </div>

          {((ingresos !== undefined && ingresos !== null) || (costos !== undefined && costos !== null)) ? (
            <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-border">
              {ingresos !== undefined && ingresos !== null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ingresos</div>
                  <div className="text-sm font-semibold text-foreground">{formatCurrency(ingresos)}</div>
                </div>
              )}
              {costos !== undefined && costos !== null && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Costos</div>
                  <div className="text-sm font-semibold text-foreground">{formatCurrency(costos)}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-3">Ventas menos gastos del período</p>
          )}
        </>
      )}
    </div>
  );
}
