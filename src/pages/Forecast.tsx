import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { useExtractedData } from '@/hooks/useExtractedData';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

function aggregateSalesByMonth(ventas: any[]): { month: string; value: number }[] {
  const map = new Map<string, number>();

  for (const r of ventas) {
    const raw: string = r.fecha || r.date || r.mes || r.month || r.periodo || '';
    if (!raw) continue;

    let key = '';
    // Try ISO date
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      key = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    } else if (/^\d{4}-\d{2}/.test(raw)) {
      // YYYY-MM
      const [year, month] = raw.split('-');
      const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
      key = dt.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      // DD/MM/YYYY
      const [dd, mm, yyyy] = raw.split('/');
      const dt = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(dt.getTime())) key = dt.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    }

    if (!key) continue;
    const amount = parseFloat(r.monto || r.total || r.amount || r.valor || r.importe || 0) || 0;
    map.set(key, (map.get(key) || 0) + amount);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      // Sort by parsing dates back
      const parse = (s: string) => new Date(s.replace(/(\w+) (\d{4})/, '$1 1, $2')).getTime();
      return parse(a) - parse(b);
    })
    .map(([month, value]) => ({ month, value }));
}

function buildForecast(history: { month: string; value: number }[]) {
  if (history.length < 2) return { chartData: history.map(d => ({ ...d, type: 'real' })), projections: null };

  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  const trend = prev > 0 ? (last - prev) / prev : 0;

  const forecastPoints = [1, 2, 3].map(offset => {
    const lastDate = new Date(history[history.length - 1].month.replace(/(\w+) (\d{4})/, '$1 1, $2'));
    lastDate.setMonth(lastDate.getMonth() + offset);
    const month = lastDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    const value = Math.round(last * Math.pow(1 + trend * 0.7, offset));
    return { month, value, type: 'forecast' };
  });

  const chartData = [
    ...history.map(d => ({ ...d, type: 'real' })),
    ...forecastPoints,
  ].map((d: any) => ({
    month: d.month,
    real: d.type === 'real' ? d.value : undefined,
    forecast: d.type === 'forecast' ? d.value :
      (d.month === history[history.length - 1].month ? d.value : undefined),
  }));

  return {
    chartData,
    projections: {
      currentEstimate: Math.round(last * (1 + trend * 0.7)),
      nextMonth: forecastPoints[1]?.value || 0,
      quarterly: forecastPoints.reduce((s, p) => s + p.value, 0),
      trend,
    },
  };
}

export default function Forecast() {
  const { data: extractedData, hasData, loading } = useExtractedData();

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Forecast — Pronóstico Predictivo</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  const realVentas = extractedData?.ventas || [];
  const salesHistory = aggregateSalesByMonth(realVentas);
  const hasEnoughData = hasData && salesHistory.length >= 2;

  if (!hasData || salesHistory.length === 0) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold">Forecast — Pronóstico Predictivo</h1>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium">Sin datos para proyectar</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                El forecast requiere historial de ventas con fechas. Cargá archivos de ventas con al menos 2 meses de historial para ver proyecciones.
              </p>
            </div>
            <Link to="/carga-datos">
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Cargar historial de ventas
              </Button>
            </Link>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (salesHistory.length === 1) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold">Forecast — Pronóstico Predictivo</h1>
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Se necesitan al menos 2 meses de historial para generar proyecciones.</p>
              <p className="text-sm mt-1">Solo tenés datos de {salesHistory.length} período. Cargá más archivos con historial.</p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  const { chartData, projections } = buildForecast(salesHistory);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Forecast — Pronóstico Predictivo</h1>

        {projections && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Próximo mes (est.)</p>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(projections.currentEstimate)}</p>
                <Badge className={`border-0 mt-1 ${Math.abs(projections.trend) < 0.05 ? 'bg-warning/15 text-warning' : projections.trend >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                  {projections.trend >= 0 ? '+' : ''}{(projections.trend * 100).toFixed(1)}% tendencia
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">En 2 meses</p>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(projections.nextMonth)}</p>
                <Badge className="border-0 bg-muted text-muted-foreground mt-1">Confianza media</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  Próximos 3 meses
                  <UITooltip>
                    <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                    <TooltipContent><p className="text-xs max-w-[250px]">Estimación basada en la tendencia reciente de tus datos históricos.</p></TooltipContent>
                  </UITooltip>
                </p>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(projections.quarterly)}</p>
                <Badge className="border-0 bg-muted text-muted-foreground mt-1">Confianza baja</Badge>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Tendencia + Proyección ({salesHistory.length} períodos)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="real" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Real" connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} name="Proyección" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> Real</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed hsl(var(--primary))', height: 0, background: 'none' }} /> Proyección</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Proyección basada en {salesHistory.length} períodos de historial de ventas. Mayor historial = mayor precisión.
        </p>
      </div>
    </TooltipProvider>
  );
}
