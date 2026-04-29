import { useMemo, useState, useEffect } from 'react';
import { extractAvailableMonths } from '@/lib/data-cleaning';
import { usePeriod } from '@/contexts/PeriodContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/ui/KPICard';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/formatters';
import { formatXAxisDate, formatAmount, formatAmountFull, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { findNumber, findString, findDateRaw, FIELD_AMOUNT, FIELD_DATE, FIELD_CLIENT, FIELD_NAME, FIELD_COST, FIELD_PROFIT } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, parseDate, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodPills } from '@/components/ui/PeriodPills';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Database, Upload, Loader2, ShoppingCart, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

function aggregateByDate(ventas: any[], m?: any): { day: string; value: number }[] {
  const map = new Map<string, { date: Date | null; value: number }>();
  for (const r of ventas) {
    const raw = findDateRaw(r, m?.date);
    if (!raw) continue;
    const d = parseDate(raw);
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

// ─── Custom Tooltip ──────────────────────────────────────────────
function VentasTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = new Date(label);
  const mes = isNaN(d.getTime()) ? label : d.toLocaleDateString('es-AR', {
    month: 'long', year: 'numeric'
  }).replace(/^\w/, (c: string) => c.toUpperCase());

  return (
    <div style={{
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: 'var(--shadow-card-hover)',
      minWidth: '160px',
    }}>
      <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginBottom: '6px', fontWeight: 500 }}>
        {mes}
      </div>
      <div style={{
        fontSize: '18px',
        fontWeight: 700,
        color: 'hsl(var(--foreground))',
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
          <stop offset="0%" stopColor="hsl(var(--pastel-mint-strong))" stopOpacity={0.95} />
          <stop offset="100%" stopColor="hsl(var(--pastel-mint))" stopOpacity={0.7} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill="url(#barGrad)" rx={4} ry={4} />
    </g>
  );
}

const PAGE_SIZE = 50;

type SortKey = 'date' | 'amount' | 'profit';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, sortConfig }: { col: SortKey; sortConfig: { key: SortKey; dir: SortDir } | null }) {
  if (!sortConfig || sortConfig.key !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
  return sortConfig.dir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-1" />
    : <ChevronDown className="inline h-3 w-3 ml-1" />;
}

export default function Ventas() {
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const m = mappings.ventas;
  const { period, setPeriod } = usePeriod();
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // Reset page when period changes
  useEffect(() => { setPage(0); }, [period]);

  const allVentas = extractedData?.ventas || [];
  const availableMonths = useMemo(
    () => extractAvailableMonths(allVentas, FIELD_DATE, (row) => findDateRaw(row, m?.date)),
    [allVentas, m]
  );
  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, m?.date));

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

  // MEJORA 2: detectar si hay datos de costo / ganancia
  const hasCostData = !!m?.cost || realVentas.some((r: any) => findNumber(r, FIELD_COST, m?.cost) > 0);
  const hasProfitData = !!m?.profit || realVentas.some((r: any) => findNumber(r, FIELD_PROFIT, m?.profit) > 0);

  // Build full sorted history (all rows, not capped at 50)
  const allSalesHistory = useMemo(() => realVentas.map((r: any) => {
    const rawDate = findDateRaw(r, m?.date) || '—';
    const parsedDate = parseDate(rawDate);
    return {
      date: rawDate,
      parsedDate,
      client: findString(r, FIELD_CLIENT, m?.client) || '',
      product: findString(r, FIELD_NAME, m?.name) || '',
      amount: findNumber(r, FIELD_AMOUNT, m?.amount),
      cost: hasCostData ? findNumber(r, FIELD_COST, m?.cost) : 0,
      profit: hasProfitData ? findNumber(r, FIELD_PROFIT, m?.profit) : 0,
    };
  }), [realVentas, m, hasCostData, hasProfitData]);

  const sortedHistory = useMemo(() => {
    if (!sortConfig) return allSalesHistory;
    return [...allSalesHistory].sort((a, b) => {
      let cmp = 0;
      if (sortConfig.key === 'date') {
        const ta = a.parsedDate?.getTime() ?? 0;
        const tb = b.parsedDate?.getTime() ?? 0;
        cmp = ta - tb;
      } else if (sortConfig.key === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortConfig.key === 'profit') {
        const pa = hasProfitData ? a.profit : (hasCostData ? a.amount - a.cost : 0);
        const pb = hasProfitData ? b.profit : (hasCostData ? b.amount - b.cost : 0);
        cmp = pa - pb;
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [allSalesHistory, sortConfig, hasCostData, hasProfitData]);

  const totalPages = Math.ceil(sortedHistory.length / PAGE_SIZE);
  const salesHistory = sortedHistory.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: 'desc' };
    });
    setPage(0);
  };

  // Totales de costo y ganancia (sobre todo el período filtrado, no solo los 50 mostrados)
  const totalCost = hasCostData
    ? realVentas.reduce((s: number, r: any) => s + findNumber(r, FIELD_COST, m?.cost), 0)
    : 0;
  const totalProfit = hasProfitData
    ? realVentas.reduce((s: number, r: any) => s + findNumber(r, FIELD_PROFIT, m?.profit), 0)
    : (hasCostData ? salesTotal - totalCost : 0);

  // Detect if client/product columns have real data (check ALL rows, not just current page)
  const hasClients = allSalesHistory.some(s => s.client && s.client !== '—');
  const hasProducts = allSalesHistory.some(s => s.product && s.product !== '—');

  // Format date robustly
  const fmtDate = (raw: string) => {
    if (raw === '—') return '—';
    const d = parseDate(raw);
    if (d) return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return raw;
  };

  
  const monthlyChart = aggregateByMonth(allVentas, m);
  // promedioMensual usa los meses del período filtrado (no el historial completo)
  // para que el KPI sea coherente con el salesTotal mostrado arriba.
  const filteredMonthlyChart = aggregateByMonth(realVentas, m);
  const monthCount = filteredMonthlyChart.length || 1;
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

        <div className={`grid gap-4 ${hasCostData ? 'md:grid-cols-3 lg:grid-cols-6' : 'md:grid-cols-4'}`}>
          <KPICard label="Total cargado" value={formatCurrencyCompact(salesTotal)} accent />
          {hasCostData && <KPICard label="Costo total" value={formatCurrencyCompact(totalCost)} />}
          {(hasCostData || hasProfitData) && <KPICard label="Ganancia bruta" value={formatCurrencyCompact(totalProfit)} />}
          <KPICard label="Promedio mensual" value={formatCurrencyCompact(promedioMensual)} />
          <KPICard label="Registros" value={realVentas.length} />
          <KPICard label="Ticket promedio" value={realVentas.length > 0 ? formatCurrencyCompact(salesTotal / realVentas.length) : '—'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {dailyChart.length >= 1 ? (
            <div className="bg-card border border-border rounded-2xl shadow-card" style={{ padding: '20px 16px 12px' }}>
              <div className="text-[10px] tracking-widest uppercase text-muted-foreground font-medium mb-4 pl-1">
                Ventas por fecha
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyChart} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
                  <XAxis dataKey="day" tickFormatter={formatXAxisDate} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatAmount} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<VentasTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
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
            <div className="bg-card border border-border rounded-2xl shadow-card" style={{ padding: '20px 16px 12px' }}>
              <div className="text-[10px] tracking-widest uppercase text-muted-foreground font-medium mb-4 pl-1">
                Evolución mensual
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyChart}>
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--pastel-mint-strong))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--pastel-mint-strong))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="0" />
                  <XAxis dataKey="month" tickFormatter={formatXAxisDate} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatAmount} tick={AXIS_STYLE.tick} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<VentasTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--pastel-mint-strong))" strokeWidth={2} fill="url(#lineGrad)" dot={false} activeDot={{ r: 4, fill: 'hsl(var(--pastel-mint-strong))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                Historial de ventas
                <span className="ml-2 font-normal text-muted-foreground/60">
                  ({realVentas.length} registros{totalPages > 1 ? ` · página ${page + 1} de ${totalPages}` : ''})
                </span>
              </CardTitle>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead
                  className="cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort('date')}
                >
                  Fecha <SortIcon col="date" sortConfig={sortConfig} />
                </TableHead>
                {hasClients && <TableHead>Cliente</TableHead>}
                {hasProducts && <TableHead>Detalle</TableHead>}
                <TableHead
                  className="text-right cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort('amount')}
                >
                  Precio de venta <SortIcon col="amount" sortConfig={sortConfig} />
                </TableHead>
                {hasCostData && <TableHead className="text-right">Costo</TableHead>}
                {(hasCostData || hasProfitData) && (
                  <TableHead
                    className="text-right cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => toggleSort('profit')}
                  >
                    Ganancia <SortIcon col="profit" sortConfig={sortConfig} />
                  </TableHead>
                )}
              </TableRow></TableHeader>
              <TableBody>
                {salesHistory.map((s, i) => {
                  const rowProfit = hasProfitData ? s.profit : (hasCostData ? s.amount - s.cost : 0);
                  return (
                    <TableRow key={`${page}-${i}`}>
                      <TableCell className="tabular-nums">{fmtDate(s.date)}</TableCell>
                      {hasClients && <TableCell className="font-medium">{s.client || '—'}</TableCell>}
                      {hasProducts && <TableCell className="text-muted-foreground">{s.product || '—'}</TableCell>}
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.amount)}</TableCell>
                      {hasCostData && <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(s.cost)}</TableCell>}
                      {(hasCostData || hasProfitData) && (
                        <TableCell className={`text-right tabular-nums font-medium ${rowProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(rowProfit)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" /> Anterior
                </button>
                <span className="text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  Siguiente <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
