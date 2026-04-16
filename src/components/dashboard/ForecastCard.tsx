import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface ForecastCardProps {
  data: { day: string; real: number | null; proyectado: number | null }[];
}

export function ForecastCard({ data }: ForecastCardProps) {
  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px]">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Forecast trimestral
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            Proyección próximos 3 meses
          </h3>
        </div>
      </div>

      {data.length > 0 ? (
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(v: number | null) => v !== null ? formatCurrency(v) : '—'}
              />
              <Line
                type="monotone"
                dataKey="real"
                stroke="hsl(var(--foreground))"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="proyectado"
                stroke="hsl(var(--accent))"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: 'hsl(var(--accent))' }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-36 flex items-center justify-center text-xs text-muted-foreground">
          Sin datos suficientes para proyectar
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-foreground" /> Histórico
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-t-2 border-dashed border-accent" /> Proyectado
        </span>
      </div>
    </div>
  );
}
