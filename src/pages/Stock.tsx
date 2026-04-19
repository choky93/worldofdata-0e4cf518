import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { findNumber, findString, findDateRaw, FIELD_NAME, FIELD_STOCK_QTY, FIELD_STOCK_MIN, FIELD_STOCK_MAX, FIELD_PRICE, FIELD_COST, FIELD_SALE_QTY, FIELD_DATE, type ColumnMapping } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { parseDate } from '@/lib/data-cleaning';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Package, ShoppingCart, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

function StatusBadge({ status }: { status: 'ok' | 'low' | 'overstock' }) {
  if (status === 'ok') return <Badge className="bg-success/15 text-success border-0">OK</Badge>;
  if (status === 'low') return <Badge className="bg-destructive/15 text-destructive border-0">Faltante</Badge>;
  return <Badge className="bg-warning/15 text-warning border-0">Sobrestock</Badge>;
}

function CoverageBadge({ days, leadDays }: { days: number | null; leadDays: number }) {
  if (days === null || !isFinite(days)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const critical = days < leadDays;
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
  status: 'ok' | 'low' | 'overstock';
  /** Average units sold per day, derived from sales data. null if no data. */
  avgDailySales: number | null;
  /** Coverage in days (stock / avg daily sales). null if no sales data. */
  coverageDays: number | null;
  supplierLeadDays: number;
}

/**
 * Build a map of product name (normalized) → average monthly units sold,
 * by aggregating ventas rows that have both name and quantity columns.
 */
function buildSalesVelocityMap(
  ventasRows: any[],
  mV?: ColumnMapping,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!ventasRows || ventasRows.length === 0) return result;

  // For each product name, collect units per YYYY-MM bucket
  const perProduct = new Map<string, Map<string, number>>();

  for (const r of ventasRows) {
    const name = findString(r, FIELD_NAME, mV?.name, ventasRows);
    if (!name) continue;
    const qty = findNumber(r, FIELD_SALE_QTY, mV?.quantity, ventasRows);
    if (!qty || qty <= 0) continue;
    const dateStr = findDateRaw(r, mV?.date);
    const d = dateStr ? parseDate(dateStr) : null;
    const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown';

    const key = name.trim().toLowerCase();
    let buckets = perProduct.get(key);
    if (!buckets) {
      buckets = new Map();
      perProduct.set(key, buckets);
    }
    buckets.set(monthKey, (buckets.get(monthKey) || 0) + qty);
  }

  for (const [name, buckets] of perProduct) {
    const months = Array.from(buckets.values());
    if (months.length === 0) continue;
    const avgMonthly = months.reduce((s, v) => s + v, 0) / months.length;
    result.set(name, avgMonthly);
  }

  return result;
}

function normalizeProducts(
  rawData: any[],
  m: ColumnMapping | undefined,
  velocityMap: Map<string, number>,
): ProductRow[] {
  return rawData.map((r: any, i: number) => {
    const stock = Math.round(findNumber(r, FIELD_STOCK_QTY, m?.stock_qty));
    const minStock = Math.round(findNumber(r, FIELD_STOCK_MIN, m?.stock_min));
    const maxStock = Math.round(findNumber(r, FIELD_STOCK_MAX, m?.stock_max)) || Math.max(stock * 2, 100);
    const price = findNumber(r, FIELD_PRICE, m?.price);
    const cost = findNumber(r, FIELD_COST, m?.cost);
    const name = findString(r, FIELD_NAME, m?.name) || `Producto ${i + 1}`;

    // Cross-reference with sales velocity map
    const avgMonthly = velocityMap.get(name.trim().toLowerCase());
    const avgDailySales: number | null = avgMonthly && avgMonthly > 0 ? avgMonthly / 30 : null;
    const coverageDays: number | null = avgDailySales && avgDailySales > 0 ? stock / avgDailySales : null;

    let status: 'ok' | 'low' | 'overstock' = 'ok';
    if (minStock > 0 && stock < minStock) status = 'low';
    else if (maxStock > 0 && stock > maxStock) status = 'overstock';

    return {
      id: r.id || String(i + 1),
      name,
      stock,
      minStock,
      maxStock,
      price,
      cost,
      status,
      avgDailySales,
      coverageDays,
      supplierLeadDays: Math.round(findNumber(r, ['lead_days', 'dias_proveedor'], m?.lead_days)) || 10,
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
  const velocityMap = useReal ? buildSalesVelocityMap(realVentas, mV) : new Map<string, number>();
  const products: ProductRow[] = useReal ? normalizeProducts(realStock, mS, velocityMap) : [];

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

  const totalValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const lowStock = products.filter(p => p.status === 'low');
  const overstock = products.filter(p => p.status === 'overstock');
  const alerts = products.filter(p => p.status !== 'ok');
  const overstockCapital = overstock.reduce((s, p) => s + Math.max(0, (p.stock - p.maxStock)) * p.cost, 0);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Stock e Inventario</h1>
          <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
            <Database className="h-3.5 w-3.5" />
            Datos reales ({realStock.length} productos)
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Valor del inventario</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalValue)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Productos</p>
            <p className="text-3xl font-bold">{products.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Faltantes
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Productos por debajo del stock mínimo</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold text-destructive">{lowStock.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Capital inmovilizado
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
              const coverageLabel = p.coverageDays === null
                ? 'sin datos de venta'
                : p.coverageDays >= 60
                  ? `${Math.round(p.coverageDays / 30)} meses de cobertura`
                  : `${Math.round(p.coverageDays)} días de cobertura`;
              return (
                <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-destructive bg-destructive/5 flex items-start gap-2">
                  <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Pedí {p.name} — solo quedan {p.stock} uds ({coverageLabel})</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Mínimo recomendado: {p.minStock} uds.</p>
                  </div>
                </div>
              );
            })}
            {overstock.map(p => (
              <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-warning bg-warning/5 flex items-start gap-2">
                <Package className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Sobrestock de {p.name}: {p.stock - p.maxStock} unidades de más</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Capital inmovilizado: {formatCurrency((p.stock - p.maxStock) * p.cost)}</p>
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
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Cobertura</TableHead>
                <TableHead className="text-right">Venta/día</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {products.map(p => {
                  const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                      <TableCell className="text-right">
                        <CoverageBadge days={p.coverageDays} leadDays={p.supplierLeadDays} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {p.avgDailySales === null ? '—' : p.avgDailySales.toFixed(1)}
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
