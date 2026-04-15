import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/ui/KPICard';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatXAxisDate, formatAmount, formatAmountFull, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { findNumber, findString, FIELD_AMOUNT, FIELD_DATE, FIELD_CLIENT, FIELD_NAME } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, parseDate, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodPills } from '@/components/ui/PeriodPills';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Database, Upload, Loader2, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

function aggregateByDate(ventas: any[], m?: any): { day: string; value: number }[] {
  const map = new Map<string, { date: Date | null; value: number }>();
  for (const r of ventas) {
    const raw = findString(r, FIELD_DATE, m?.date);
    if (!raw) continue;
    const d = parseDate(raw);
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
    .map(([day, { value }]) => ({ day, value }));
}

function aggregateByMonth(ventas: any[], m?: any): { month: string; value: number }[] {
  const map = new Map<string, { date: Date; value: number }>();
  for (const r of ventas) {
    const raw = findString(r, FIELD_DATE, m?.date);
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

// ─── Custom Tooltip ──────────────────────────────────────────────
function VentasTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label);
  const mes = isNaN(d.getTime()) ? label : d.toLocaleDateString('es-AR', {
    month: 'long', year: 'numeric'
  }).replace(/^\w/, (c: string) => c.toUpperCase());

  return (
    <div style={{
      background: '#1a1a1a',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      minWidth: '160px',
    }}>
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px', fontWeight: 500 }}>
        {mes}
      </div>
      <div style={{
        fontSize: '18px',
        fontWeight: 700,
        color: '#c8f135',
        fontFamily: "'DM Mono', monospace",
        letterSpacing: '-0.02em',
      }}>
        {formatAmountFull(payload[0]?.value ?? 0)}
      </div>
    </div>
  );
}

// ─── Gradient Bar ────────────────────────────────────────────────
function GradientBar(props: any) {
  const { x, y, width, height } = props;
  if (!height || height <= 0) return null;
  return (
    <g>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8f135" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#7ab800" stopOpacity={0.6} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill="url(#barGrad)" rx={3} ry={3} />
    </g>
  );
}

export default function Ventas() {
  const { data: extractedData, mappings, hasData, loading, availableMonths } = useExtractedData();
  const m = mappings.ventas;
  const [period, setPeriod] = useState<PeriodKey>('all');
  const allVentas = extractedData?.ventas || [];
  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row, kw) => findString(row, kw, m?.date));

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

  const dailyChart = aggregateByDate(realVentas, m);
  // salesTotal se calcula desde el gráfico para garantizar que card y barras coincidan
  const salesTotal = dailyChart.reduce((sum, d) => sum + d.value, 0);

  const salesHistory = realVentas.slice(0, 50).map((r: any) => ({
    date: findString(r, FIELD_DATE, m?.date) || '—',
    client: findString(r, FIELD_CLIENT, m?.client) || '',
    product: findString(r, FIELD_NAME, m?.name) || '',
    amount: findNumber(r, FIELD_AMOUNT, m?.amount),
  }));

  // Detect if client/product columns have real data
  const hasClients = salesHistory.some(s => s.client && s.client !== '—');
  const hasProducts = salesHistory.some(s => s.product && s.product !== '—');

  // Format date robustly
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
              <PeriodPills value={period} onChange={setPeriod} availableMonths={availableMonths} />
              <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
                <Database className="h-3.5 w-3.5" />
                Datos reales ({realVentas.length} registros)
              </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <KPICard label="Total cargado" value={formatCurrency(salesTotal)} accent />
          <KPICard label="Promedio mensual" value={formatCurrency(promedioMensual)} />
          <KPICard label="Registros" value={realVentas.length} />
          <KPICard label="Ticket promedio" value={realVentas.length > 0 ? formatCurrency(salesTotal / realVentas.length) : '—'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {dailyChart.length >= 2 ? (
            <div style={{ background: '#0d0d0d', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px 16px 12px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: '16px', fontWeight: 500, paddingLeft: '4px' }}>
                Ventas por fecha
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyChart} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#1a1a1a" strokeDasharray="0" />
                  <XAxis dataKey="day" tickFormatter={formatXAxisDate} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatAmount} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<VentasTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <Bar dataKey="value" shape={<GradientBar />} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Ventas por fecha</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Se necesitan fechas en los datos para mostrar el gráfico diario.
              </CardContent>
            </Card>
          )}

          {monthlyChart.length >= 2 ? (
            <div style={{ background: '#0d0d0d', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px 16px 12px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: '16px', fontWeight: 500, paddingLeft: '4px' }}>
                Evolución mensual
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyChart}>
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c8f135" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#c8f135" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="0" />
                  <XAxis dataKey="month" tickFormatter={formatXAxisDate} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatAmount} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<VentasTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="#c8f135" strokeWidth={2} fill="url(#lineGrad)" dot={false} activeDot={{ r: 4, fill: '#c8f135', stroke: '#0d0d0d', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
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
