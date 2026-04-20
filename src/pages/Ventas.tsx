import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';
import { findNumber, findString, FIELD_AMOUNT, FIELD_DATE, FIELD_CLIENT, FIELD_NAME } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, parseDate, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodFilter } from '@/components/PeriodFilter';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Database, Upload, Loader2, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Find date raw value from a row, validating it actually parses as a date.
 *  Hardened against the FIELD_DATE pollution (__EMPTY/unnamed) in field-utils:
 *  every candidate is run through parseDate and rejected if it doesn't yield a real date. */
function findDateRaw(row: any, mappedCol?: string | null): string {
  // Priority 1: mapped column — but validate it actually parses as a date
  if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null) {
    const v = row[mappedCol] instanceof Date
      ? (row[mappedCol] as Date).toISOString().split('T')[0]
      : String(row[mappedCol]).trim();
    if (v && parseDate(v)) return v;
  }
  // Priority 2: keyword search — exclude __EMPTY/unnamed (broken-header markers, not date keywords)
  // and reject any result that doesn't parse as a real date
  const semanticDateKeywords = FIELD_DATE.filter(
    k => !/^_*empty$/i.test(k) && !/^unnamed/i.test(k)
  );
  const raw = findString(row, semanticDateKeywords); // do NOT pass mappedCol — already tried above
  if (raw && parseDate(raw)) return raw;
  // Priority 3: scan all values for anything that LOOKS like a date and parses
  // (covers cases where the date column has no header and ends up as __EMPTY)
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'string') {
      const s = val.trim();
      // Only consider strings that look like date formats (avoids matching IDs/quantities)
      if (
        /^\d{4}-\d{2}(-\d{2})?/.test(s) ||
        /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(s) ||
        /^\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}$/.test(s)
      ) {
        if (parseDate(s)) return s;
      }
    }
  }
  return '';
}

function aggregateByDate(ventas: any[], m?: any): { day: string; value: number }[] {
  const map = new Map<string, { date: Date | null; value: number }>();
  for (const r of ventas) {
    const raw = findDateRaw(r, m?.date);
    if (!raw) continue;
    const d = parseDate(raw);
    const key = d
      ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
      : raw;
    const amt = findNumber(r, FIELD_AMOUNT, m?.amount);
    const existing = map.get(key);
    if (existing) {
      existing.value += amt;
    } else {
      map.set(key, { date: d, value: amt });
    }
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime();
      return 0;
    })
    .slice(-60)
    .map(([day, { value }]) => ({ day, value }));
}

function aggregateByMonth(ventas: any[], m?: any): { month: string; value: number }[] {
  const map = new Map<string, { date: Date; value: number }>();
  for (const r of ventas) {
    const raw = findDateRaw(r, m?.date);
    if (!raw) continue;
    const d = parseDate(raw);
    if (!d) continue;
    const key = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
    const existing = map.get(key);
    const amt = findNumber(r, FIELD_AMOUNT, m?.amount);
    if (existing) {
      existing.value += amt;
    } else {
      map.set(key, { date: d, value: amt });
    }
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
    .map(([month, { value }]) => ({ month, value }));
}

export default function Ventas() {
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const m = mappings.ventas;
  const [period, setPeriod] = useState<PeriodKey>('all');
  const allVentas = extractedData?.ventas || [];

  const realVentas = period === 'all'
    ? allVentas
    : filterByPeriod(allVentas, FIELD_DATE, period, (row, kw) => {
        // Use findDateRaw for robust date detection including __EMPTY columns
        return findDateRaw(row, m?.date) || findString(row, kw, m?.date);
      });

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

  if (!hasData || allVentas.length === 0) {
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

  const salesTotal = realVentas.reduce((sum: number, r: any) => sum + findNumber(r, FIELD_AMOUNT, m?.amount), 0);

  const salesHistory = realVentas.slice(0, 50).map((r: any) => ({
    date: findDateRaw(r, m?.date) || '—',
    client: findString(r, FIELD_CLIENT, m?.client) || '',
    product: findString(r, FIELD_NAME, m?.name) || '',
    amount: findNumber(r, FIELD_AMOUNT, m?.amount),
  }));

  const hasClients = salesHistory.some(s => s.client && s.client !== '—');
  const hasProducts = salesHistory.some(s => s.product && s.product !== '—');

  const fmtDate = (raw: string) => {
    if (raw === '—') return '—';
    const d = parseDate(raw);
    if (d) return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return raw;
  };

  const dailyChart = aggregateByDate(realVentas, m);
  const monthlyChart = aggregateByMonth(realVentas, m);
  const monthCount = monthlyChart.length || 1;
  const promedioMensual = Math.round(salesTotal / monthCount);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ventas</h1>
          <div className="flex items-center gap-3">
            <PeriodFilter value={period} onChange={setPeriod} />
            <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 rounded-lg px-3 py-1.5 border border-success/20">
              <Database className="h-3.5 w-3.5" />
              Datos reales ({realVentas.length} registros)
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total cargado</p>
            <p className="text-2xl font-bold tabular-nums truncate">{formatCurrency(salesTotal)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Promedio mensual</p>
            <p className="text-2xl font-bold tabular-nums truncate">{formatCurrency(promedioMensual)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Registros</p>
            <p className="text-2xl font-bold">{realVentas.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Ticket promedio
              <UITooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Total / número de registros</p></TooltipContent>
              </UITooltip>
            </p>
            <p className="text-2xl font-bold tabular-nums truncate">
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
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
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
                {hasClients && <TableHead>Cliente</TableHead>}
                {hasProducts && <TableHead>Detalle</TableHead>}
                <TableHead className="text-right">Monto</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {salesHistory.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="tabular-nums">{fmtDate(s.date)}</TableCell>
                    {hasClients && <TableCell className="font-medium">{s.client || '—'}</TableCell>}
                    {hasProducts && <TableCell className="text-muted-foreground">{s.product || '—'}</TableCell>}
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
