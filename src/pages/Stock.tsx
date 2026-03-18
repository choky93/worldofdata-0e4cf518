import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { mockProducts } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function StatusBadge({ status }: { status: 'ok' | 'low' | 'overstock' }) {
  if (status === 'ok') return <Badge className="bg-success/15 text-success border-0">OK</Badge>;
  if (status === 'low') return <Badge className="bg-destructive/15 text-destructive border-0">Faltante</Badge>;
  return <Badge className="bg-warning/15 text-warning border-0">Sobrestock</Badge>;
}

export default function Stock() {
  const totalValue = mockProducts.reduce((s, p) => s + p.stock * p.cost, 0);
  const alerts = mockProducts.filter(p => p.status !== 'ok');

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Stock e Inventario</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Valor total del inventario</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalValue)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Productos</p>
          <p className="text-3xl font-bold">{mockProducts.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Alertas activas</p>
          <p className="text-3xl font-bold text-destructive">{alerts.length}</p>
        </CardContent></Card>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(p => (
            <div key={p.id} className={`text-sm p-3 rounded-lg border-l-4 ${p.status === 'overstock' ? 'border-l-warning bg-warning/5' : 'border-l-destructive bg-destructive/5'}`}>
              {p.status === 'overstock'
                ? `Sobrestock de ${p.name}: vendé ${p.stock - p.maxStock} unidades para liberar capital (${formatCurrency((p.stock - p.maxStock) * p.cost)} parado)`
                : `Faltante de ${p.name}: solo quedan ${p.stock} unidades (mínimo: ${p.minStock}). Pedí al proveedor.`}
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Inventario completo</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Producto</TableHead><TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Precio venta</TableHead><TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Margen</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mockProducts.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(p.price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(p.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPercent(((p.price - p.cost) / p.price) * 100)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
