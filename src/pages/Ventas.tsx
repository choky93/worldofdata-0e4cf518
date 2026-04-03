import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { findNumber, findString, FIELD_AMOUNT, FIELD_DATE, FIELD_CLIENT, FIELD_NAME } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodFilter } from '@/components/PeriodFilter';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Database, Upload, Loader2, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

function aggregateByDate(ventas: any[]): { day: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of ventas) {
    const raw = findString(r, FIELD_DATE);
    if (!raw) continue;
    let key = raw;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      key = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      key = raw.substring(0, 5);
    }
    const amt = findNumber(r, FIELD_AMOUNT);
    map.set(key, (map.get(key) || 0) + amt);
  }
  return Array.from(map.entries()).slice(-30).map(([day, value]) => ({ day, value }));
}

function aggregateByMonth(ventas: any[]): { month: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of ventas) {
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
    const amt = findNumber(r, FIELD_AMOUNT);
    map.set(key, (map.get(key) || 0) + amt);
  }
  const parseKey = (s: string) => new Date(s.replace(/(\w+) (\d{4})/, '$1 1, $2')).getTime();
  return Array.from(map.entries())
    .sort(([a], [b]) => parseKey(a) - parseKey(b))
    .map(([month, value]) => ({ month, value }));
}

export default function Ventas() {
  const { data: extractedData, hasData, loading } = useExtractedData();
  const realVentas = extractedData?.ventas || [];

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  if (!hasData || realVentas.length === 0) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Ventas</h1>
            <Link to="/carga-datos" className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5 border border-border hover:text-primary transition-colors">
              <Database className="h-3.5 w-3.5" />
              Cargá tus archivos
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium">Sin datos de ventas</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                Cargá archivos de ventas (Excel, CSV, PDF) para ver tu historial, tendencias y proyecciones.
              </p>
            </div>
            <Link to="/carga-datos">
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Cargar archivos de ventas
              </Button>
            </Link>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  const salesTotal = realVentas.reduce((sum: number, r: any) => sum + findNumber(r, FIELD_AMOUNT), 0);

  const salesHistory = realVentas.slice(0, 50).map((r: any, i: number) => ({
    date: findString(r, FIELD_DATE) || '—',
    client: findString(r, FIELD_CLIENT) || '—',
    product: findString(r, FIELD_NAME) || '—',
    amount: findNumber(r, FIELD_AMOUNT),
  }));

  const dailyChart = aggregateByDate(realVentas);
  const monthlyChart = aggregateByMonth(realVentas);
  const estimated = Math.round(salesTotal * 1.2);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ventas</h1>
          <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 rounded-lg px-3 py-1.5 border border-success/20">
            <Database className="h-3.5 w-3.5" />
            Datos reales ({realVentas.length} registros)
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total cargado</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(salesTotal)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Estimado mensual</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(estimated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Registros</p>
            <p className="text-3xl font-bold">{realVentas.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Ticket promedio
              <UITooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Total / número de registros</p></TooltipContent>
              </UITooltip>
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {realVentas.length > 0 ? formatCurrency(salesTotal / realVentas.length) : '—'}
            </p>
          </CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {dailyChart.length >= 2 ? (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Ventas por fecha</CardTitle></CardHeader>
              <CardContent><div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Ventas por fecha</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Se necesitan fechas en los datos para mostrar el gráfico diario.
              </CardContent>
            </Card>
          )}

          {monthlyChart.length >= 2 ? (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Evolución mensual</CardTitle></CardHeader>
              <CardContent><div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyChart}>
                    <defs>
                      <linearGradient id="salesMonthlyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#salesMonthlyGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Evolución mensual</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Se necesitan datos de múltiples meses para mostrar la evolución.
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Historial de ventas ({salesHistory.length} mostrados)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {salesHistory.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="tabular-nums">
                      {s.date !== '—' ? (() => { try { return formatDate(s.date); } catch { return s.date; } })() : '—'}
                    </TableCell>
                    <TableCell className="font-medium">{s.client}</TableCell>
                    <TableCell className="text-muted-foreground">{s.product}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {realVentas.length > 50 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Mostrando 50 de {realVentas.length} registros.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
