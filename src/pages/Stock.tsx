import { useMemo, useState, useEffect } from 'react';
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
import { AlertTriangle, Package, ShoppingCart, Database, DollarSign, TrendingUp, Wallet, ChevronUp, ChevronDown, ChevronsUpDown, EyeOff, Eye, Info, Bell, Calendar, Clock, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import {
  classifyProduct,
  isExcludedFromStock,
  markAsExcluded,
  markAsIncluded,
  clearOverride,
  subscribeStockExclusions,
} from '@/lib/stock-classification';
import { toast } from 'sonner';
import { useSuppliers } from '@/hooks/useSuppliers';
import { Link as RouterLink } from 'react-router-dom';

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
  /** Ola 14: producto excluido del cálculo de stock (servicio/seña/preventa). */
  excluded: boolean;
  /** 'auto-service' | 'manual-excluded' | 'manual-included' | 'normal' */
  classification: ReturnType<typeof classifyProduct>;
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
  defaultLeadTimeDays: number,
  // Ola 16: callback opcional para resolver lead time real por proveedor
  resolveLeadTime?: (name: string) => { days: number; supplier?: { id: string; name: string }; source: 'override' | 'real' | 'promised' | null },
): (ProductRow & { supplierName?: string; supplierId?: string; leadSource: 'override' | 'real' | 'promised' | 'default' })[] {
  return rawDeduped.map((r: any, i: number) => {
    const stock = Math.round(getStockUnits(r, m?.stock_qty));
    const minStock = Math.round(findNumber(r, FIELD_STOCK_MIN, m?.stock_min));
    const maxStock = Math.round(findNumber(r, FIELD_STOCK_MAX, m?.stock_max)) || Math.max(stock * 2, 100);
    const price = getPrice(r, m?.price);
    const cost = getCost(r, m?.cost);
    const name = getProductName(r, m?.name) || `Producto ${i + 1}`;

    const avgMonthly = avgMonthlyByProduct.get(name.trim().toLowerCase()) || 0;
    const coverageDays = avgMonthly > 0 ? (stock / avgMonthly) * 30 : 0;
    const excluded = isExcludedFromStock(name);
    const classification = classifyProduct(name);

    // Ola 16: lead time efectivo por producto
    const resolved = resolveLeadTime?.(name);
    const effectiveLead = resolved && resolved.days > 0 ? resolved.days : defaultLeadTimeDays;
    const leadSource: 'override' | 'real' | 'promised' | 'default' = resolved?.source ?? 'default';

    const status: StockStatus = excluded ? 'no-data' : getStockStatus(coverageDays, effectiveLead);

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
      supplierLeadDays: effectiveLead,
      excluded,
      classification,
      supplierId: resolved?.supplier?.id,
      supplierName: resolved?.supplier?.name,
      leadSource,
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
  // Lead time global por defecto (usado solo cuando no hay proveedor vinculado).
  // Ola 16: si hay proveedor para el producto, getEffectiveLeadTimeForProduct
  // devuelve un valor más preciso (override > real avg > prometido).
  const leadTimeDays = 20;
  const { suppliers, getEffectiveLeadTimeForProduct } = useSuppliers();
  const hasSuppliers = suppliers.length > 0;

  // Dedupe stock rows by product (most recent file → fallback to higher stock)
  const dedupedStock = useMemo(
    () => (useReal ? dedupeStockRows(realStock, mS?.name, mS?.stock_qty) : []),
    [useReal, realStock, mS],
  );

  const avgMonthlyByProduct = useMemo(
    () => (useReal ? buildAvgMonthlyByProduct(realVentas, mV) : new Map()),
    [useReal, realVentas, mV],
  );

  // Ola 14: re-render cuando cambian los overrides manuales (markAsExcluded, etc.)
  const [exclusionsTick, setExclusionsTick] = useState(0);
  useEffect(() => {
    return subscribeStockExclusions(() => setExclusionsTick(t => t + 1));
  }, []);
  const [showExcluded, setShowExcluded] = useState(false);

  const products = useMemo(
    () => (useReal ? normalizeProducts(dedupedStock, mS, avgMonthlyByProduct, leadTimeDays, getEffectiveLeadTimeForProduct) : []),
    // exclusionsTick fuerza re-render cuando el usuario cambia un override
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useReal, dedupedStock, mS, avgMonthlyByProduct, exclusionsTick, suppliers.length],
  );

  const visibleProducts = useMemo(
    () => showExcluded ? products : products.filter(p => !p.excluded),
    [products, showExcluded],
  );
  const excludedCount = products.filter(p => p.excluded).length;

  const handleExcludeToggle = (p: ProductRow) => {
    if (p.classification === 'manual-excluded' || p.classification === 'auto-service') {
      // Volver a incluir
      if (p.classification === 'auto-service') {
        markAsIncluded(p.name);
        toast.success(`"${p.name}" se incluye en stock`);
      } else {
        clearOverride(p.name);
        toast.success(`"${p.name}" volvió al modo automático`);
      }
    } else {
      markAsExcluded(p.name);
      toast.success(`"${p.name}" excluido del cálculo de stock`, {
        description: 'Útil para servicios, señas y preventas.',
      });
    }
  };

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
    const base = visibleProducts;
    if (!sortConfig) return base;
    const { key, dir } = sortConfig;
    return [...base].sort((a, b) => {
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
  }, [visibleProducts, sortConfig]);

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

  // ── Aggregations (Ola 14: excluyen servicios/preventas/señas) ───
  const realProducts = products.filter(p => !p.excluded);
  const totalUnits = realProducts.reduce((s, p) => s + p.stock, 0);
  const valorAlCosto = realProducts.reduce((s, p) => s + p.stock * p.cost, 0);
  const valorDeVenta = realProducts.reduce((s, p) => s + p.stock * p.price, 0);
  const gananciaProyectada = valorDeVenta - valorAlCosto;

  // Las alertas de stock se calculan SOLO sobre productos físicos reales (excluye servicios)
  const lowStock = realProducts.filter(p => p.status === 'low' || p.status === 'critical');
  const overstock = realProducts.filter(p => p.status === 'overstock');
  const alerts = realProducts.filter(p => p.status !== 'ok' && p.status !== 'no-data');
  const overstockCapital = overstock.reduce((s, p) => s + Math.max(0, (p.stock - p.maxStock)) * p.cost, 0);

  // Cobertura promedio (solo productos con ventas reales y no excluidos)
  const productsWithSales = realProducts.filter(p => p.avgMonthlyUnits > 0);
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
            Datos reales ({realProducts.length} productos físicos{excludedCount > 0 ? ` · ${excludedCount} excluido${excludedCount === 1 ? '' : 's'}` : ''} · {totalUnits.toLocaleString('es-AR')} uds)
          </div>
        </div>

        {/* Header: 3 nuevas tarjetas de valoración + stats clave */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <KPICard
            label="Valor al costo"
            value={formatCurrency(valorAlCosto)}
            subtext="Capital inmovilizado"
            icon={<Wallet className="h-4 w-4" />}
            help="Cuánto te costó comprar todo el stock que tenés. Es plata que está atada en mercadería esperando ser vendida."
          />
          <KPICard
            label="Valor de venta"
            value={formatCurrency(valorDeVenta)}
            subtext="Si vendieras todo el stock"
            icon={<DollarSign className="h-4 w-4" />}
            help="Cuánto facturarías si vendés todo el stock al precio actual. Excluye servicios/preventas."
          />
          <KPICard
            label="Ganancia proyectada"
            value={formatCurrency(gananciaProyectada)}
            subtext={valorAlCosto > 0 ? `Margen ${formatPercent((gananciaProyectada / valorAlCosto) * 100)}` : '—'}
            icon={<TrendingUp className="h-4 w-4" />}
            accent
            help="Diferencia entre Valor de venta y Valor al costo. Es lo que ganás si lográs vender el inventario completo."
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
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alertas activas ({alerts.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lowStock.map(p => {
                const coverageRound = Math.round(p.coverageDays);
                const coverageLabel = p.coverageDays === 0
                  ? 'sin datos de venta'
                  : p.coverageDays >= 60
                    ? `${Math.round(p.coverageDays / 30)} meses`
                    : `${coverageRound} días`;
                // Ola 16: cuándo pedir = hoy + (cobertura − lead time efectivo)
                const daysUntilStockout = Math.max(0, coverageRound - p.supplierLeadDays);
                const orderByDate = new Date();
                orderByDate.setDate(orderByDate.getDate() + daysUntilStockout);
                // Cantidad sugerida: 30 días de venta promedio + lead time, redondeado
                const suggestedQty = p.avgMonthlyUnits > 0
                  ? Math.ceil((p.avgMonthlyUnits * (30 + p.supplierLeadDays)) / 30 - p.stock)
                  : Math.max(p.minStock - p.stock, 10);
                const isCritical = p.status === 'critical';

                return (
                  <Card key={p.id} className={isCritical ? 'border-l-4 border-l-destructive bg-destructive/5' : 'border-l-4 border-l-warning bg-warning/5'}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-semibold">{p.stock}</span> en stock · {coverageLabel} de cobertura
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${isCritical ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}`}>
                          {isCritical ? 'CRÍTICO' : 'BAJO'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <p className="text-[10px] text-muted-foreground">Proveedor</p>
                            <p className="font-medium truncate">{p.supplierName ?? <span className="text-muted-foreground italic">Sin asignar</span>}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <p className="text-[10px] text-muted-foreground">
                              Lead time {p.leadSource === 'real' ? '(real)' : p.leadSource === 'promised' ? '(prometido)' : p.leadSource === 'override' ? '(override)' : '(default)'}
                            </p>
                            <p className="font-medium">{p.supplierLeadDays} días</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs space-y-0.5">
                        <p className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Pedí antes del</span>
                          <span className="font-semibold">{orderByDate.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                          <span className="text-muted-foreground">({daysUntilStockout}d)</span>
                        </p>
                        {suggestedQty > 0 && (
                          <p className="flex items-center gap-1.5">
                            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Sugerido pedir</span>
                            <span className="font-semibold">{suggestedQty} unidades</span>
                            <span className="text-muted-foreground">para 30d + lead</span>
                          </p>
                        )}
                      </div>

                      {!p.supplierName && hasSuppliers && (
                        <p className="text-[11px] text-muted-foreground italic">
                          💡 Asigná un proveedor en la página de Proveedores para que el lead time sea más preciso.
                        </p>
                      )}
                      {!hasSuppliers && (
                        <p className="text-[11px]">
                          <RouterLink to="/proveedores" className="text-primary underline">
                            Cargá tus proveedores
                          </RouterLink>
                          <span className="text-muted-foreground"> para mejorar las alertas.</span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {overstock.map(p => (
                <Card key={p.id} className="border-l-4 border-l-warning bg-warning/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Math.round(p.coverageDays)} días de cobertura · stock excedente: {Math.max(0, p.stock - p.maxStock)} uds
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 bg-warning/30 text-warning-foreground border border-warning/40">
                        SOBRESTOCK
                      </span>
                    </div>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Capital inmovilizado:</span>{' '}
                      <span className="font-semibold">{formatCurrency(Math.max(0, p.stock - p.maxStock) * p.cost)}</span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm text-muted-foreground">Inventario completo</CardTitle>
                {excludedCount > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {excludedCount} producto{excludedCount === 1 ? '' : 's'} excluido{excludedCount === 1 ? '' : 's'} del cálculo (servicios/señas/preventas).
                  </p>
                )}
              </div>
              {excludedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowExcluded(v => !v)}
                >
                  {showExcluded ? <><EyeOff className="h-3 w-3" /> Ocultar excluidos</> : <><Eye className="h-3 w-3" /> Mostrar excluidos</>}
                </Button>
              )}
            </div>
          </CardHeader>
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
                <TableHead className="w-12"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sortedProducts.map(p => {
                  const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                  return (
                    <TableRow key={p.id} className={p.excluded ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.name}
                          {p.classification === 'auto-service' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                                  Servicio
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">Detectado como servicio/seña/preventa por su nombre. No entra al cálculo de stock.</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {p.classification === 'manual-excluded' && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">Excluido</span>
                          )}
                          {p.classification === 'manual-included' && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-success/10 text-success">Incluido</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="text-right">
                        {p.excluded ? <span className="text-xs text-muted-foreground">—</span> : <CoverageBadge days={p.coverageDays} status={p.status} />}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {p.avgMonthlyUnits === 0 ? '—' : p.avgMonthlyUnits.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(margin)}</TableCell>
                      <TableCell>{p.excluded ? <span className="text-[10px] text-muted-foreground">N/A</span> : <StatusBadge status={p.status} />}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleExcludeToggle(p)}
                              className="p-1.5 rounded hover:bg-muted transition-colors"
                              aria-label={p.excluded ? 'Incluir en stock' : 'Excluir del cálculo de stock'}
                            >
                              {p.excluded ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">
                              {p.excluded
                                ? 'Volver a incluir en el cálculo de stock'
                                : 'Excluir del cálculo (útil para servicios, señas, preventas que no son stock físico)'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
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
