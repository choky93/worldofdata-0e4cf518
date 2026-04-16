import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface ForecastCardProps {
  data: { day: string; real: number | null; proyectado: number | null }[];
}

export function ForecastCard({ data }: ForecastCardProps) {
  const hasData = data.length >= 2;

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px] flex flex-col">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Forecast trimestral
        </p>
        <h3 className="text-lg font-semibold text-foreground">
          Proyección próximos 3 meses
        </h3>
      </div>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground relative overflow-hidden">
          <svg
            className="absolute inset-0 w-full h-full opacity-30"
            preserveAspectRatio="none"
            viewBox="0 0 300 100"
          >
            <path
              d="M 0 70 Q 75 40, 150 50 T 300 30"
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          </svg>
          <TrendingUp className="w-10 h-10 opacity-40 relative" strokeWidth={1.5} />
          <span className="text-xs relative text-center max-w-[240px]">
            Sin datos suficientes para proyectar. Cargá al menos 2 períodos para ver forecast.
          </span>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
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
                  dot={{ r: 3, fill: 'hsl(var(--foreground))' }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="proyectado"
                  stroke="hsl(var(--pastel-mint-strong))"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: 'hsl(var(--pastel-mint-strong))' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-foreground" /> Histórico
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed" style={{ borderColor: 'hsl(var(--pastel-mint-strong))' }} /> Proyectado
            </span>
          </div>
        </>
      )}
    </div>
  );
}
