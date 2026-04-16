import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface VentasMesCardProps {
  total: number | null;
  data: { day: string; value: number }[];
  periodLabel?: string;
}

export function VentasMesCard({ total, data, periodLabel }: VentasMesCardProps) {
  const hasData = data.length > 0 && total !== null && total > 0;
  const hasMultiplePoints = data.length >= 2;
  const maxValue = hasMultiplePoints ? Math.max(...data.map(d => d.value), 0) : 0;
  const visible = data.slice(-12);

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px] flex flex-col">
      <div className="mb-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Ventas del mes
        </p>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <BarChart3 className="w-8 h-8 opacity-40" strokeWidth={1.5} />
          <span className="text-xs">Sin datos en este período</span>
        </div>
      ) : (
        <>
          <h3 className="text-3xl font-bold text-foreground tracking-tight mb-3">
            {formatCurrency(total!)}
          </h3>

          {hasMultiplePoints ? (
            <div className="flex-1 min-h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visible} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barCategoryGap="20%">
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--secondary))' }}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {visible.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.value === maxValue ? 'hsl(var(--accent))' : 'hsl(var(--secondary))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-end">
              <span className="text-xs text-muted-foreground">
                {periodLabel ? `Período: ${periodLabel}` : `Período único: ${data[0].day}`}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
