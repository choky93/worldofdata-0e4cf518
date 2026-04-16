import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { formatXAxisDate, formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { useExtractedData } from '@/hooks/useExtractedData';
import { aggregateSalesByMonth, buildForecast } from '@/lib/forecast-engine';
import type { ForecastPoint } from '@/lib/forecast-engine';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart,
} from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Forecast() {
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const mV = mappings.ventas;

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
  const salesHistory = aggregateSalesByMonth(realVentas, mV?.date, mV?.amount);
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

  const { chartData, projections, usesSeasonality } = buildForecast(salesHistory);

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
                <Badge className={`border-0 mt-1 ${usesSeasonality ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {usesSeasonality ? 'Con estacionalidad' : 'Solo tendencia'}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  Próximos 3 meses
                  <UITooltip>
                    <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[250px]">
                        {usesSeasonality
                          ? 'Proyección basada en tendencia (promedio ponderado últimos 6 meses) + factores de estacionalidad histórica.'
                          : 'Proyección basada en tendencia (promedio ponderado últimos 6 meses). Se necesita al menos 1 año de datos para incluir estacionalidad.'}
                      </p>
                    </TooltipContent>
                  </UITooltip>
                </p>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(projections.quarterly)}</p>
                <Badge className="border-0 bg-muted text-muted-foreground mt-1">
                  {usesSeasonality ? 'Confianza media' : 'Confianza baja'}
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Tendencia + Proyección ({salesHistory.length} períodos)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="confidenceBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c8f135" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#c8f135" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                  <XAxis dataKey="month" tick={AXIS_STYLE.tick} tickFormatter={formatXAxisDate} />
                  <YAxis tick={AXIS_STYLE.tick} tickFormatter={formatAmount} />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const labels: Record<string, string> = {
                        real: 'Real',
                        forecast: 'Proyección',
                        forecastUpper: 'Banda superior (+15%)',
                        forecastLower: 'Banda inferior (−15%)',
                      };
                      return [formatCurrency(v), labels[name] || name];
                    }}
                    labelFormatter={formatXAxisDate}
                    {...TOOLTIP_STYLE}
                  />
                  {/* Confidence band */}
                  <Area
                    type="monotone"
                    dataKey="forecastUpper"
                    stroke="none"
                    fill="url(#confidenceBand)"
                    connectNulls={false}
                    activeDot={false}
                    name="forecastUpper"
                  />
                  <Area
                    type="monotone"
                    dataKey="forecastLower"
                    stroke="none"
                    fill="#0d0d0d"
                    connectNulls={false}
                    activeDot={false}
                    name="forecastLower"
                  />
                  {/* Real data */}
                  <Line
                    type="monotone"
                    dataKey="real"
                    stroke="#c8f135"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#c8f135' }}
                    name="real"
                    connectNulls={false}
                  />
                  {/* Forecast line */}
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#c8f135"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ r: 3, fill: '#c8f135' }}
                    name="forecast"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-primary inline-block" /> Real</span>
              <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #c8f135', height: 0, background: 'none' }} /> Proyección</span>
              <span className="flex items-center gap-1"><span className="w-4 h-2 inline-block rounded-sm" style={{ background: 'rgba(200,241,53,0.1)' }} /> Banda ±15%</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          {usesSeasonality
            ? `Proyección basada en ${salesHistory.length} períodos con tendencia ponderada + estacionalidad histórica.`
            : `Proyección basada en tendencia (${salesHistory.length} períodos). Se necesita al menos 1 año de datos para incluir estacionalidad.`}
        </p>
      </div>
    </TooltipProvider>
  );
}
