import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface VentasMesCardProps {
  total: number | null;
  data: { day: string; value: number }[];
}

export function VentasMesCard({ total, data }: VentasMesCardProps) {
  const maxValue = Math.max(...data.map(d => d.value), 0);

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px]">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Ventas del mes
          </p>
          <h3 className="text-3xl font-bold text-foreground tracking-tight">
            {total !== null ? formatCurrency(total) : '—'}
          </h3>
        </div>
      </div>

      {data.length > 0 ? (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(-12)} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
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
                {data.slice(-12).map((entry, i) => (
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
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Sin datos de ventas
        </div>
      )}
    </div>
  );
}
