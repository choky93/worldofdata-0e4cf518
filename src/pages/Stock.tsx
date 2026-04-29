import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import {
  findNumber,
  findString,
  findDateRaw,
  FIELD_NAME,
  FIELD_STOCK_MIN,
  FIELD_STOCK_MAX,
  FIELD_DATE,
  getStockUnits,
  getCost,
  getPrice,
  getProductName,
  getQuantity,
  getStockStatus,
  dedupeStockRows,
  type StockStatus,
  type ColumnMapping,
} from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { parseDate } from '@/lib/data-cleaning';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Package, ShoppingCart, Database, DollarSign, TrendingUp, Wallet, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KPICard } from '@/components/ui/KPICard';

function StatusBadge({ status }: { status: StockStatus }) {
  switch (status) {
    case 'ok':
      return <Badge className="bg-success/15 text-success border-0">OK</Badge>;
    case 'low':
      return <Badge className="bg-warning/15 text-warning border-0">Bajo</Badge>;
    case 'critical':
      return <Badge className="bg-destructive/15 text-destructive border-0">Crítico</Badge>;
    case 'overstock':
      return <Badge className="bg-warning/25 text-warning border border-warning/40">Sobrestock</Badge>;
    case 'no-data':
    default:
      return <Badge className="bg-muted text-muted-foreground border-0">Sin venta</Badge>;
  }
}

function CoverageBadge({ days, status }: { days: number; status: StockStatus }) {
  if (status === 'no-data' || !days || !isFinite(days)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const critical = status === 'critical' || status === 'low';
  const label = days >= 60 ? `${Math.round(days / 30)} meses` : `${Math.round(days)} días`;
  return (
    <span className={`text-xs font-medium tabular-nums ${critical ? 'text-destructive' : 'text-muted-foreground'}`}>
      {label}
      {critical && <AlertTriangle className="h-3 w-3 inline ml-1" />}
    </span>
  );
}

interface ProductRow {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  maxStock: number;
  price: number;
  cost: number;
  status: StockStatus;
  avgMonthlyUnits: number; // 0 if no sales data
  coverageDays: number;    // 0 if no sales data
  supplierLeadDays: number;
}

/**
 * Build product → average monthly units sold from ventas rows.
 * Denominator = months where THIS product actually had sales (not total months
 * in the dataset), so a product sold once in 26 months gets avg = units/1,
 * not units/26, avoiding absurdly inflated coverage values.
 */
function buildAvgMonthlyByProduct(
  ventasRows: any[],
  mV: ColumnMapping | undefined,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!ventasRows || ventasRows.length === 0) return result;

  const totals = new Map<string, number>();
  const activeMonths = new Map<string, Set<string>>();

  for (const r of ventasRows) {
    const name = getProductName(r, mV?.name);
    if (!name) continue;
    const qty = getQuantity(r, mV?.quantity);
    if (!qty || qty <= 0) continue;
    const key = name.trim().toLowerCase();
    totals.set(key, (totals.get(key) || 0) + qty);

    const raw = findDateRaw(r, mV?.date);
    const d = parseDate(raw);
    if (d) {
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!activeMonths.has(key)) activeMonths.set(key, new Set());
      activeMonths.get(key)!.add(month);
    }
  }

  for (const [k, total] of totals) {
    const months = activeMonths.get(k)?.size || 1;
    result.set(k, total / months);
  }
  return result;
}

function normalizeProducts(
  rawDeduped: any[],
  m: ColumnMapping | undefined,
  avgMonthlyByProduct: Map<string, number>,
  leadTimeDays: number,
): ProductRow[] {
  return rawDeduped.map((r: any, i: number) => {
    const stock = Math.round(getStockUnits(r, m?.stock_qty));
    const minStock = Math.round(findNumber(r, FIELD_STOCK_MIN, m?.stock_min));
    const maxStock = Math.round(findNumber(r, FIELD_STOCK_MAX, m?.stock_max)) || Math.max(stock * 2, 100);
    const price = getPrice(r, m?.price);
    const cost = getCost(r, m?.cost);
    const name = getProductName(r, m?.name) || `Producto ${i + 1}`;

    const avgMonthly = avgMonthlyByProduct.get(name.trim().toLowerCase()) || 0;
    const coverageDays = avgMonthly > 0 ? (stock / avgMonthly) * 30 : 0;
    const status: StockStatus = getStockStatus(coverageDays, leadTimeDays);

    return {
      id: r.id || String(i + 1),
      name,
      stock,
      minStock,
      maxStock,
      price,
      cost,
      status,
      avgMonthlyUnits: avgMonthly,
      coverageDays,
      supplierLeadDays: leadTimeDays,
    };
  });
}

export default function Stock() {
  const { data: extractedData, mappings, hasData } = useExtractedData();
  const mS = mappings.stock;
  const mV = mappings.ventas;
  const realStock = extractedData?.stock || [];
  const realVentas = extractedData?.ventas || [];

  const useReal = hasData && realStock.length > 0;
  const leadTimeDays = 20;

  // Dedupe stock rows by product (most recent file → fallback to higher stock)
  const dedupedStock = useMemo(
    () => (useReal ? dedupeStockRows(realStock, mS?.name, mS?.stock_qty) : []),
    [useReal, realStock, mS],
  );

  const avgMonthlyByProduct = useMemo(
    () => (useReal ? buildAvgMonthlyByProduct(realVentas, mV) : new Map()),
    [useReal, realVentas, mV],
  );

  const products: ProductRow[] = useMemo(
    () => (useReal ? normalizeProducts(dedupedStock, mS, avgMonthlyByProduct, leadTimeDays) : []),
    [useReal, dedupedStock, mS, avgMonthlyByProduct],
  );

  // ── Orden de la tabla por columna (Ola 9) ───────────────────
  type StockSortKey = 'name' | 'stock' | 'coverage' | 'avgMonthly' | 'price' | 'cost' | 'margin';
  type StockSortDir = 'asc' | 'desc';
  const [sortConfig, setSortConfig] = useState<{ key: StockSortKey; dir: StockSortDir } | null>(null);
  const toggleSort = (key: StockSortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };
  const SortIcon = ({ col }: { col: StockSortKey }) => {
    if (!sortConfig || sortConfig.key !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortConfig.dir === 'asc' ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };
  const sortedProducts = useMemo(() => {
    if (!sortConfig) return products;
    const { key, dir } = sortConfig;
    return [...products].sort((a, b) => {
      let cmp = 0;
      if (key === 'name') {
        cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      } else if (key === 'coverage') {
        cmp = a.coverageDays - b.coverageDays;
      } else if (key === 'avgMonthly') {
        cmp = a.avgMonthlyUnits - b.avgMonthlyUnits;
      } else if (key === 'margin') {
        const ma = a.price > 0 ? ((a.price - a.cost) / a.price) * 100 : 0;
        const mb = b.price > 0 ? ((b.price - b.cost) / b.price) * 100 : 0;
        cmp = ma - mb;
      } else {
        cmp = (a[key] as number) - (b[key] as number);
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [products, sortConfig]);

  if (!useReal) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Sin datos de stock</h2>
        <p className="text-muted-foreground max-w-md">Cargá un archivo con datos de inventario para ver el análisis completo.</p>
        <Link to="/carga-datos" className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">Ir a Carga de Datos →</Link>
      </div>
    );
  }

  // ── Aggregations sobre el set DEDUPEADO ─────────────────────
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const valorAlCosto = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const valorDeVenta = products.reduce((s, p) => s + p.stock * p.price, 0);
  const gananciaProyectada = valorDeVenta - valorAlCosto;

  const lowStock = products.filter(p => p.status === 'low' || p.status === 'critical');
  const overstock = products.filter(p => p.status === 'overstock');
  const alerts = products.filter(p => p.status !== 'ok' && p.status !== 'no-data');
  const overstockCapital = overstock.reduce((s, p) => s + Math.max(0, (p.stock - p.maxStock)) * p.cost, 0);

  // Cobertura promedio (solo productos con ventas reales)
  const productsWithSales = products.filter(p => p.avgMonthlyUnits > 0);
  const avgCoverage = productsWithSales.length > 0
    ? productsWithSales.reduce((s, p) => s + p.coverageDays, 0) / productsWithSales.length
    : 0;

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Stock e Inventario</h1>
          <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
            <Database className="h-3.5 w-3.5" />
            Datos reales ({products.length} productos · {totalUnits.toLocaleString('es-AR')} uds)
          </div>
        </div>

        {/* Header: 3 nuevas tarjetas de valoración + stats clave */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <KPICard
            label="Valor al costo"
            value={formatCurrency(valorAlCosto)}
            subtext="Capital inmovilizado"
            icon={<Wallet className="h-4 w-4" />}
          />
          <KPICard
            label="Valor de venta"
            value={formatCurrency(valorDeVenta)}
            subtext="Si vendieras todo el stock"
            icon={<DollarSign className="h-4 w-4" />}
          />
          <KPICard
            label="Ganancia proyectada"
            value={formatCurrency(gananciaProyectada)}
            subtext={valorAlCosto > 0 ? `Margen ${formatPercent((gananciaProyectada / valorAlCosto) * 100)}` : '—'}
            icon={<TrendingUp className="h-4 w-4" />}
            accent
          />
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unidades totales</p>
            <p className="text-3xl font-bold tabular-nums">{totalUnits.toLocaleString('es-AR')}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Productos únicos</p>
            <p className="text-3xl font-bold">{products.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Cobertura prom.
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Días de stock promedio según el ritmo de ventas histórico</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {avgCoverage > 0 ? `${Math.round(avgCoverage)} d` : '—'}
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Capital sobrestock
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Dinero atado en productos con sobrestock (unidades excedentes × costo)</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold text-warning tabular-nums">{formatCurrency(overstockCapital)}</p>
          </CardContent></Card>
        </div>

        {alerts.length > 0 && (
          <div className="space-y-2">
            {lowStock.map(p => {
              const coverageLabel = p.coverageDays === 0
                ? 'sin datos de venta'
                : p.coverageDays >= 60
                  ? `${Math.round(p.coverageDays / 30)} meses de cobertura`
                  : `${Math.round(p.coverageDays)} días de cobertura`;
              return (
                <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-destructive bg-destructive/5 flex items-start gap-2">
                  <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Pedí {p.name} — solo quedan {p.stock} uds ({coverageLabel})</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Lead time proveedor: {p.supplierLeadDays} días.</p>
                  </div>
                </div>
              );
            })}
            {overstock.map(p => (
              <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-warning bg-warning/5 flex items-start gap-2">
                <Package className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Sobrestock de {p.name}: {Math.round(p.coverageDays)} días de cobertura</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Capital inmovilizado: {formatCurrency(Math.max(0, p.stock - p.maxStock) * p.cost)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Inventario completo</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('name')}>
                  Producto <SortIcon col="name" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('stock')}>
                  Stock <SortIcon col="stock" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('coverage')}>
                  Cobertura <SortIcon col="coverage" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('avgMonthly')}>
                  Venta/mes <SortIcon col="avgMonthly" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('price')}>
                  Precio <SortIcon col="price" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('cost')}>
                  Costo <SortIcon col="cost" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('margin')}>
                  Margen <SortIcon col="margin" />
                </TableHead>
                <TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sortedProducts.map(p => {
                  const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="text-right">
                        <CoverageBadge days={p.coverageDays} status={p.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {p.avgMonthlyUnits === 0 ? '—' : p.avgMonthlyUnits.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(margin)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
