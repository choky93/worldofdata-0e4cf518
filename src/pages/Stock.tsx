import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatters';
import { mockProducts } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Package, ShoppingCart } from 'lucide-react';

function StatusBadge({ status }: { status: 'ok' | 'low' | 'overstock' }) {
  if (status === 'ok') return <Badge className="bg-success/15 text-success border-0">OK</Badge>;
  if (status === 'low') return <Badge className="bg-destructive/15 text-destructive border-0">Faltante</Badge>;
  return <Badge className="bg-warning/15 text-warning border-0">Sobrestock</Badge>;
}

function CoverageBadge({ days, leadDays }: { days: number; leadDays: number }) {
  const critical = days < leadDays;
  return (
    <span className={`text-xs font-medium tabular-nums ${critical ? 'text-destructive' : 'text-muted-foreground'}`}>
      {days} días
      {critical && <AlertTriangle className="h-3 w-3 inline ml-1" />}
    </span>
  );
}

export default function Stock() {
  const totalValue = mockProducts.reduce((s, p) => s + p.stock * p.cost, 0);
  const alerts = mockProducts.filter(p => p.status !== 'ok');
  const lowStock = mockProducts.filter(p => p.status === 'low');
  const overstock = mockProducts.filter(p => p.status === 'overstock');
  const overstockCapital = overstock.reduce((s, p) => s + (p.stock - p.maxStock) * p.cost, 0);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Stock e Inventario</h1>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Valor del inventario</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalValue)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Productos</p>
            <p className="text-3xl font-bold">{mockProducts.length}</p>
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

        {/* Reposition alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {lowStock.map(p => {
              const coverageDays = p.avgDailySales > 0 ? Math.round(p.stock / p.avgDailySales) : 999;
              return (
                <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-destructive bg-destructive/5 flex items-start gap-2">
                  <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Pedí {p.name} — solo quedan {p.stock} uds ({coverageDays} días de cobertura)</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Tu proveedor tarda {p.supplierLeadDays} días. Mínimo recomendado: {p.minStock} uds.</p>
                  </div>
                </div>
              );
            })}
            {overstock.map(p => (
              <div key={p.id} className="text-sm p-3 rounded-lg border-l-4 border-l-warning bg-warning/5 flex items-start gap-2">
                <Package className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Sobrestock de {p.name}: {p.stock - p.maxStock} unidades de más</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Capital inmovilizado: {formatCurrency((p.stock - p.maxStock) * p.cost)}. Considerá una promo para mover stock.</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Inventario completo</CardTitle></CardHeader>
          <CardContent>
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
                {mockProducts.map(p => {
                  const coverageDays = p.avgDailySales > 0 ? Math.round(p.stock / p.avgDailySales) : 999;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                      <TableCell className="text-right">
                        <CoverageBadge days={coverageDays} leadDays={p.supplierLeadDays} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.avgDailySales}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(((p.price - p.cost) / p.price) * 100)}</TableCell>
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
