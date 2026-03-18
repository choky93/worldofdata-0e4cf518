import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { mockMetrics } from '@/lib/mock-data';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  if (current > previous) return <TrendingUp className="h-4 w-4 text-success" />;
  if (current < previous) return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function MetricChart({ data, title, formatter }: { data: { month: string; value: number }[]; title: string; formatter: (v: number) => string }) {
  const current = data[data.length - 1]?.value ?? 0;
  const previous = data[data.length - 2]?.value ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        <div className="flex items-center gap-1">
          <TrendIcon current={current} previous={previous} />
          <span className="text-lg font-bold tabular-nums">{formatter(current)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217,71%,45%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(217,71%,45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatter(v)} />
              <Tooltip formatter={(v: number) => formatter(v)} />
              <Area type="monotone" dataKey="value" stroke="hsl(217,71%,45%)" fill={`url(#grad-${title})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Metricas() {
  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart data={mockMetrics.salesEvolution} title="Evolución de Ventas" formatter={formatCurrency} />
        <MetricChart data={mockMetrics.marginEvolution} title="Margen de Ganancia (%)" formatter={(v) => formatPercent(v)} />
        <MetricChart data={mockMetrics.cashFlowEvolution} title="Flujo de Caja" formatter={formatCurrency} />
      </div>
    </div>
  );
}
