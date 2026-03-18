import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { mockForecast, mockMonthlySales } from '@/lib/mock-data';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';

const forecastData = [
  ...mockMonthlySales,
  { month: 'Abr 2026', value: 2350000, forecast: true },
  { month: 'May 2026', value: 1900000, forecast: true },
  { month: 'Jun 2026', value: 1950000, forecast: true },
];

function ConfidenceBadge({ level }: { level: 'alta' | 'media' | 'baja' }) {
  const cls = level === 'alta' ? 'bg-success/15 text-success' : level === 'media' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive';
  return <Badge className={`border-0 ${cls}`}>Confianza {level}</Badge>;
}

export default function Forecast() {
  return (
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
            <p className="text-sm text-muted-foreground">Trimestre</p>
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
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(217,71%,45%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Estacionalidad (factor de venta por mes)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockForecast.seasonality}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="factor" fill="hsl(217,71%,45%)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
