import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockOperations } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type FilterType = 'all' | 'sale' | 'purchase';

export default function Operaciones() {
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = filter === 'all' ? mockOperations : mockOperations.filter(op => op.type === filter);
  const totalSales = mockOperations.filter(op => op.type === 'sale').reduce((s, op) => s + op.amount, 0);
  const totalPurchases = mockOperations.filter(op => op.type === 'purchase').reduce((s, op) => s + op.amount, 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Operaciones</h1>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total vendido</p>
          <p className="text-3xl font-bold text-success tabular-nums">{formatCurrency(totalSales)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total comprado</p>
          <p className="text-3xl font-bold text-destructive tabular-nums">{formatCurrency(totalPurchases)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className={`text-3xl font-bold tabular-nums ${totalSales - totalPurchases >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(totalSales - totalPurchases)}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground">Registro de operaciones</CardTitle>
          <div className="flex gap-1">
            {(['all', 'sale', 'purchase'] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter(f)}
                className="text-xs h-7"
              >
                {f === 'all' ? 'Todas' : f === 'sale' ? 'Ventas' : 'Compras'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(op => (
                <TableRow key={op.id}>
                  <TableCell className="tabular-nums">{formatDate(op.date)}</TableCell>
                  <TableCell>
                    <Badge variant={op.type === 'sale' ? 'default' : 'outline'}>
                      {op.type === 'sale' ? 'Venta' : 'Compra'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{op.category}</TableCell>
                  <TableCell>{op.description}</TableCell>
                  <TableCell>{op.counterpart}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${op.type === 'purchase' ? 'text-destructive' : 'text-success'}`}>
                    {op.type === 'purchase' ? '-' : '+'}{formatCurrency(op.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
