import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { mockForecast, mockMonthlySales } from '@/lib/mock-data';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, ReferenceLine } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const forecastData = [
  ...mockMonthlySales.map(d => ({ ...d, type: 'real' })),
  { month: 'Abr 2026', value: 2350000, type: 'forecast' },
  { month: 'May 2026', value: 1900000, type: 'forecast' },
  { month: 'Jun 2026', value: 1950000, type: 'forecast' },
];

const chartData = forecastData.map(d => ({
  month: d.month,
  real: d.type === 'real' ? d.value : undefined,
  forecast: d.type === 'forecast' ? d.value : (d === forecastData[mockMonthlySales.length - 1] ? d.value : undefined),
}));

function ConfidenceBadge({ level }: { level: 'alta' | 'media' | 'baja' }) {
  const cls = level === 'alta' ? 'bg-success/15 text-success' : level === 'media' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive';
  return <Badge className={`border-0 ${cls}`}>Confianza {level}</Badge>;
}

export default function Forecast() {
  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Forecast — Pronóstico Predictivo</h1>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Mes actual (estimado)</p>
              <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockForecast.currentMonth.estimated)}</p>
              <ConfidenceBadge level={mockForecast.currentMonth.confidence} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Próximo mes</p>
              <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockForecast.nextMonth.estimated)}</p>
              <ConfidenceBadge level={mockForecast.nextMonth.confidence} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                Trimestre
                <UITooltip>
                  <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                  <TooltipContent><p className="text-xs">Estimación de ventas acumuladas para los próximos 3 meses basada en estacionalidad y tendencia</p></TooltipContent>
                </UITooltip>
              </p>
              <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockForecast.quarterly.estimated)}</p>
              <ConfidenceBadge level={mockForecast.quarterly.confidence} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Tendencia + Proyección</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="real" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Real" connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeDasharray: '' }} name="Proyección" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> Real</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed hsl(var(--primary))', height: 0, background: 'none' }} /> Proyección</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
              Estacionalidad (factor de venta por mes)
              <UITooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-[250px]">Factor multiplicador basado en el historial. Un factor de 1.0 = promedio. Mayor a 1 = mes fuerte, menor a 1 = mes débil.</p></TooltipContent>
              </UITooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockForecast.seasonality}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                  <Tooltip />
                  <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: 'Promedio', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Bar dataKey="factor" fill="hsl(var(--primary))" radius={[4,4,0,0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
