import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { findNumber, findString, findDateRaw, FIELD_CLIENT, FIELD_TOTAL_PURCHASES, FIELD_DEBT, FIELD_LAST_PURCHASE, FIELD_PURCHASE_COUNT, FIELD_AMOUNT, FIELD_DATE, type ColumnMapping } from '@/lib/field-utils';
import { parseDate, filterByPeriod, extractAvailableMonths } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { usePeriod } from '@/contexts/PeriodContext';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Users, Crown, Award, Star, Upload, Loader2, Database, Info, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ClientRow {
  id: string;
  name: string;
  totalPurchases: number;
  pendingPayment: number;
  lastPurchase: string;
  purchaseCount: number;
  avgTicket: number;
}

function normalizeClients(rawData: any[], m?: ColumnMapping): ClientRow[] {
  return rawData.map((r: any, i: number) => {
    const totalPurchases = findNumber(r, FIELD_TOTAL_PURCHASES, m?.total_purchases);
    const purchaseCount = Math.round(findNumber(r, FIELD_PURCHASE_COUNT, m?.purchase_count));
    const avgTicket = purchaseCount > 0 ? totalPurchases / purchaseCount : findNumber(r, ['ticket_promedio', 'promedio'], m?.avg_ticket);
    return {
      id: r.id || String(i + 1),
      name: findString(r, FIELD_CLIENT, m?.client) || `Cliente ${i + 1}`,
      totalPurchases,
      pendingPayment: findNumber(r, FIELD_DEBT, m?.debt),
      lastPurchase: findString(r, FIELD_LAST_PURCHASE, m?.last_purchase),
      purchaseCount,
      avgTicket,
    };
  });
}

/** Build client list by grouping ventas rows by client name */
function buildClientsFromVentas(ventasRows: any[], mV?: ColumnMapping): ClientRow[] {
  const map = new Map<string, { total: number; count: number; lastDate: Date | null }>();

  for (const r of ventasRows) {
    const name = findString(r, FIELD_CLIENT, mV?.client);
    if (!name) continue;

    const amount = findNumber(r, FIELD_AMOUNT, mV?.amount);
    const dateStr = findDateRaw(r, mV?.date);
    const date = dateStr ? parseDate(dateStr) : null;

    const existing = map.get(name);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
      if (date && (!existing.lastDate || date > existing.lastDate)) {
        existing.lastDate = date;
      }
    } else {
      map.set(name, { total: amount, count: 1, lastDate: date });
    }
  }

  return Array.from(map.entries()).map(([name, info], i) => ({
    id: String(i + 1),
    name,
    totalPurchases: info.total,
    pendingPayment: 0,
    lastPurchase: info.lastDate ? info.lastDate.toISOString().split('T')[0] : '',
    purchaseCount: info.count,
    avgTicket: info.count > 0 ? info.total / info.count : 0,
  }));
}

export default function Clientes() {
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const { period, setPeriod } = usePeriod();
  const mC = mappings.clientes;
  const mV = mappings.ventas;
  const realClientes = extractedData?.clientes || [];
  const allVentas = extractedData?.ventas || [];
  const useClientesDirectos = hasData && realClientes.length > 0;
  const useClientesDesdeVentas = hasData && realClientes.length === 0 && allVentas.length > 0;
  const useReal = useClientesDirectos || useClientesDesdeVentas;

  // Period filtering only applies to ventas-derived clients
  const availableMonths = useMemo(
    () => extractAvailableMonths(allVentas, FIELD_DATE, (row) => findDateRaw(row, mV?.date)),
    [allVentas, mV]
  );
  const realVentas = useClientesDesdeVentas
    ? (period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, mV?.date)))
    : allVentas;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  if (!useReal) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="text-lg font-medium">Sin datos de clientes</p>
            <p className="text-muted-foreground mt-1 max-w-md">
              Cargá archivos con información de tu cartera de clientes para ver análisis, cobros pendientes y riesgo de churn.
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
    );
  }

  const clients = useClientesDirectos
    ? normalizeClients(realClientes, mC)
    : buildClientsFromVentas(realVentas, mV);
  const totalPending = clients.reduce((s, c) => s + c.pendingPayment, 0);
  const totalSales = clients.reduce((s, c) => s + c.totalPurchases, 0);
  const sorted = [...clients].sort((a, b) => b.totalPurchases - a.totalPurchases);

  // Ola 22: ordenamiento de la cartera de clientes
  type ClientSortKey = 'name' | 'totalPurchases' | 'avgTicket' | 'purchaseCount' | 'pendingPayment' | 'lastPurchase';
  type ClientSortDir = 'asc' | 'desc';
  const [sortConfig, setSortConfig] = useState<{ key: ClientSortKey; dir: ClientSortDir } | null>(null);
  const toggleSort = (key: ClientSortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };
  const SortIcon = ({ col }: { col: ClientSortKey }) => {
    if (!sortConfig || sortConfig.key !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortConfig.dir === 'asc' ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };
  const sortedClientList = useMemo(() => {
    if (!sortConfig) return clients;
    const { key, dir } = sortConfig;
    return [...clients].sort((a, b) => {
      let cmp = 0;
      if (key === 'name') cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      else if (key === 'lastPurchase') {
        const da = parseDate(a.lastPurchase)?.getTime() ?? 0;
        const db = parseDate(b.lastPurchase)?.getTime() ?? 0;
        cmp = da - db;
      } else cmp = (a[key] as number) - (b[key] as number);
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [clients, sortConfig]);
  const top2Pct = sorted.length >= 2 && totalSales > 0
    ? ((sorted[0].totalPurchases + sorted[1].totalPurchases) / totalSales * 100).toFixed(0)
    : '0';
  const withChurn = clients.filter(c => {
    if (!c.lastPurchase) return false;
    const d = parseDate(c.lastPurchase);
    if (!d || isNaN(d.getTime())) return false;
    const daysSince = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 30;
  });

  const chartData = clients
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, 6)
    .map(c => ({
      name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
      compras: c.totalPurchases,
    }));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Clientes</h1>
          <div className="flex items-center gap-3">
            {useClientesDesdeVentas && (
              <PeriodSelector value={period} onChange={setPeriod} availableMonths={availableMonths} />
            )}
            <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
              <Database className="h-3.5 w-3.5" />
              {clients.length} clientes
            </div>
          </div>
        </div>

        {useClientesDesdeVentas && (
          <Alert className="border-primary/30 bg-primary/5">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              Clientes detectados desde datos de ventas. Para más detalle (deuda, frecuencia exacta), cargá un archivo de clientes.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Total clientes
              <HelpTooltip content="Cantidad de clientes únicos detectados (cargados manualmente o inferidos del archivo de Ventas)." />
            </p>
            <p className="text-3xl font-bold">{clients.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Cobros pendientes
              <HelpTooltip content="Suma de la deuda informada por cada cliente. Útil para priorizar la cobranza. Solo aparece si tu archivo tiene una columna de deuda/saldo." />
            </p>
            <p className={`text-3xl font-bold tabular-nums ${totalPending > 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(totalPending)}
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Concentración top 2
              <HelpTooltip content="Qué % de las ventas totales hacen los 2 clientes más grandes. Si está cerca del 100%, dependés mucho de pocos clientes (riesgo de pérdida si alguno se va)." />
            </p>
            <p className="text-3xl font-bold text-warning tabular-nums">{top2Pct}%</p>
            <p className="text-xs text-muted-foreground">de las ventas totales</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Sin compras +30 días
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Clientes que no compraron en los últimos 30 días</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold text-destructive">{withChurn.length}</p>
            <p className="text-xs text-muted-foreground">clientes en riesgo</p>
          </CardContent></Card>
        </div>

        {chartData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Compras por cliente (top 6)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                     <XAxis type="number" tick={AXIS_STYLE.tick} tickFormatter={formatAmount} />
                     <YAxis type="category" dataKey="name" tick={AXIS_STYLE.tick} width={100} />
                     <RTooltip formatter={(v: number) => formatCurrency(v)} {...TOOLTIP_STYLE} />
                     <Bar dataKey="compras" fill="hsl(var(--pastel-mint-strong))" radius={[0, 4, 4, 0]} />
                   </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {withChurn.length > 0 && (
          <div className="alert-error rounded-lg p-4 flex items-start gap-3 border-l-4 border-l-destructive">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Clientes sin compras recientes</p>
              <p className="text-sm text-muted-foreground mt-1">
                {withChurn.slice(0, 5).map(c => c.name).join(', ')} no compraron en los últimos 30 días. Contactalos para retenerlos.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Cartera de clientes</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('name')}>
                  Cliente <SortIcon col="name" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('totalPurchases')}>
                  Compras totales <SortIcon col="totalPurchases" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('avgTicket')}>
                  Ticket promedio <SortIcon col="avgTicket" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('purchaseCount')}>
                  Pedidos <SortIcon col="purchaseCount" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('pendingPayment')}>
                  Deuda <SortIcon col="pendingPayment" />
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('lastPurchase')}>
                  Última compra <SortIcon col="lastPurchase" />
                </TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sortedClientList.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.totalPurchases)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.avgTicket)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.purchaseCount || '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums ${c.pendingPayment > 0 ? 'text-destructive font-medium' : ''}`}>
                      {c.pendingPayment > 0 ? formatCurrency(c.pendingPayment) : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {c.lastPurchase ? (() => { try { return formatDate(c.lastPurchase); } catch { return c.lastPurchase; } })() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
