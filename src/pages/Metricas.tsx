import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { mockMetrics } from '@/lib/mock-data';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  const pct = previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : '0';
  if (current > previous) return <span className="flex items-center gap-1 text-success text-xs"><TrendingUp className="h-4 w-4" />+{pct}%</span>;
  if (current < previous) return <span className="flex items-center gap-1 text-destructive text-xs"><TrendingDown className="h-4 w-4" />{pct}%</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-xs"><Minus className="h-4 w-4" />0%</span>;
}

function MetricChart({ data, title, formatter, tooltip }: { data: { month: string; value: number }[]; title: string; formatter: (v: number) => string; tooltip?: string }) {
  const current = data[data.length - 1]?.value ?? 0;
  const previous = data[data.length - 2]?.value ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
          {title}
          {tooltip && (
            <UITooltip>
              <TooltipTrigger asChild><span className="cursor-help text-xs">ⓘ</span></TooltipTrigger>
              <TooltipContent><p className="text-xs max-w-[250px]">{tooltip}</p></TooltipContent>
            </UITooltip>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <TrendIcon current={current} previous={previous} />
          <span className="text-lg font-bold tabular-nums">{formatter(current)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`grad-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatter(v)} />
              <Tooltip formatter={(v: number) => formatter(v)} />
              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill={`url(#grad-${title.replace(/\s/g, '')})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Metricas() {
  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricChart data={mockMetrics.salesEvolution} title="Evolución de Ventas" formatter={formatCurrency} />
          <MetricChart
            data={mockMetrics.marginEvolution}
            title="Margen de Ganancia"
            formatter={(v) => formatPercent(v)}
            tooltip="Margen neto = (Ventas - Costos) / Ventas × 100. Muestra qué porcentaje de cada venta es ganancia."
          />
          <MetricChart data={mockMetrics.cashFlowEvolution} title="Flujo de Caja" formatter={formatCurrency} tooltip="Dinero disponible al cierre de cada mes, considerando cobros y pagos." />
          <MetricChart data={mockMetrics.stockEvolution} title="Valor de Inventario" formatter={formatCurrency} tooltip="Valor total del stock al costo de reposición al cierre de cada mes." />
        </div>
      </div>
    </TooltipProvider>
  );
}
