import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockClients } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Clientes() {
  const totalPending = mockClients.reduce((s, c) => s + c.pendingPayment, 0);
  const totalSales = mockClients.reduce((s, c) => s + c.totalPurchases, 0);
  const top2Pct = ((mockClients[0].totalPurchases + mockClients[1].totalPurchases) / totalSales * 100).toFixed(0);

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total clientes</p>
          <p className="text-3xl font-bold">{mockClients.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Cobros pendientes</p>
          <p className="text-3xl font-bold text-destructive tabular-nums">{formatCurrency(totalPending)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Concentración top 2</p>
          <p className="text-3xl font-bold text-warning tabular-nums">{top2Pct}%</p>
          <p className="text-xs text-muted-foreground">de las ventas totales</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Cartera de clientes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead className="text-right">Compras totales</TableHead>
              <TableHead className="text-right">Deuda</TableHead><TableHead>Última compra</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mockClients.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.totalPurchases)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${c.pendingPayment > 0 ? 'text-destructive font-medium' : ''}`}>
                    {c.pendingPayment > 0 ? formatCurrency(c.pendingPayment) : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDate(c.lastPurchase)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
