import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { findNumber, findString, FIELD_AMOUNT, FIELD_DATE, FIELD_STOCK_QTY } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Upload, Loader2, BarChart3 } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  const pct = previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : '0';
  if (current > previous) return <span className="flex items-center gap-1 text-success text-xs"><TrendingUp className="h-4 w-4" />+{pct}%</span>;
  if (current < previous) return <span className="flex items-center gap-1 text-destructive text-xs"><TrendingDown className="h-4 w-4" />{pct}%</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-xs"><Minus className="h-4 w-4" />0%</span>;
}

function MetricChart({ data, title, formatter, tooltip }: {
  data: { month: string; value: number }[];
  title: string;
  formatter: (v: number) => string;
  tooltip?: string;
}) {
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

function aggregateByMonth(rows: any[], fieldKeywords: string[]): { month: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = findString(r, FIELD_DATE);
    if (!raw) continue;
    let key = '';
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      key = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    } else if (/^\d{4}-\d{2}/.test(raw)) {
      const [year, month] = raw.split('-');
      const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
      key = dt.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const [dd, mm, yyyy] = raw.split('/');
      const dt = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(dt.getTime())) key = dt.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    }
    if (!key) continue;
    const amount = findNumber(r, fieldKeywords);
    map.set(key, (map.get(key) || 0) + amount);
  }
  const parseMonthKey = (s: string) => new Date(s.replace(/(\w+) (\d{4})/, '$1 1, $2')).getTime();
  return Array.from(map.entries())
    .sort(([a], [b]) => parseMonthKey(a) - parseMonthKey(b))
    .map(([month, value]) => ({ month, value }));
}

export default function Metricas() {
  const { data: extractedData, hasData, loading } = useExtractedData();

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  const realVentas = extractedData?.ventas || [];
  const realGastos = extractedData?.gastos || [];
  const realStock = extractedData?.stock || [];

  const salesEvolution = aggregateByMonth(realVentas, FIELD_AMOUNT);
  const gastosEvolution = aggregateByMonth(realGastos, FIELD_AMOUNT);
  const stockEvolution = aggregateByMonth(realStock, FIELD_STOCK_QTY);

  const hasCharts = salesEvolution.length >= 2;
  const hasAny = hasData && (realVentas.length > 0 || realGastos.length > 0 || realStock.length > 0);

  if (!hasAny) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium">Sin datos para mostrar métricas</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                Las métricas de dirección se construyen a partir de tus datos de ventas, gastos e inventario.
                Cargá archivos con historial para ver la evolución de tus indicadores clave.
              </p>
            </div>
            <Link to="/carga-datos">
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Cargar archivos
              </Button>
            </Link>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (!hasCharts) {
    // Has data but not enough for time-series charts — show summary cards
    const totalVentas = realVentas.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT), 0);
    const totalGastos = realGastos.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT), 0);
    const margen = totalVentas > 0 ? ((totalVentas - totalGastos) / totalVentas) * 100 : 0;

    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
          <div className="grid gap-4 lg:grid-cols-2">
            {totalVentas > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total ventas cargadas</p>
                  <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalVentas)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{realVentas.length} registros</p>
                </CardContent>
              </Card>
            )}
            {totalGastos > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Total gastos cargados</p>
                  <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalGastos)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{realGastos.length} registros</p>
                </CardContent>
              </Card>
            )}
            {totalVentas > 0 && totalGastos > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Margen bruto estimado</p>
                  <p className="text-3xl font-bold tabular-nums">{formatPercent(margen)}</p>
                </CardContent>
              </Card>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Los gráficos de evolución requieren datos con fechas y al menos 2 períodos distintos.
          </p>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Métricas de Dirección</h1>
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricChart
            data={salesEvolution}
            title="Evolución de Ventas"
            formatter={formatCurrency}
          />
          {gastosEvolution.length >= 2 && (
            <MetricChart
              data={gastosEvolution}
              title="Evolución de Gastos"
              formatter={formatCurrency}
              tooltip="Total de gastos acumulados por período según los archivos cargados."
            />
          )}
          {stockEvolution.length >= 2 && (
            <MetricChart
              data={stockEvolution}
              title="Valor de Inventario"
              formatter={formatCurrency}
              tooltip="Valor del stock cargado por período."
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
