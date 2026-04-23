import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface StockCardProps {
  ok: number;
  bajo: number;
  critico: number;
}

export function StockCard({ ok, bajo, critico }: StockCardProps) {
  const total = ok + bajo + critico;
  const data = [
    { name: 'OK', value: ok, color: 'hsl(var(--pastel-mint-strong))' },
    { name: 'Bajo', value: bajo, color: 'hsl(var(--pastel-peach-strong))' },
    { name: 'Crítico', value: critico, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  const formatUnits = (n: number): string => {
    if (n >= 1000) return n.toLocaleString('es-AR');
    return String(n);
  };

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px]">
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Estado de stock
      </p>

      {total > 0 ? (
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 relative shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-sm font-bold tabular-nums">{formatUnits(total)}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">productos</span>
            </div>
          </div>

          <div className="flex-1 space-y-2 text-xs">
            <Row color="hsl(var(--pastel-mint-strong))" label="OK" value={ok} />
            <Row color="hsl(var(--pastel-peach-strong))" label="Bajo" value={bajo} />
            <Row color="hsl(var(--destructive))" label="Crítico" value={critico} />
          </div>
        </div>
      ) : (
        <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">
          Sin datos de stock
        </div>
      )}
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value.toLocaleString('es-AR')}</span>
    </div>
  );
}
