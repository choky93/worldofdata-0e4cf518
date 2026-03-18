import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockOperations } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Operaciones() {
  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Operaciones</h1>
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Registro de operaciones</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Descripción</TableHead>
              <TableHead>Contraparte</TableHead><TableHead className="text-right">Monto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mockOperations.map(op => (
                <TableRow key={op.id}>
                  <TableCell className="tabular-nums">{formatDate(op.date)}</TableCell>
                  <TableCell><Badge variant={op.type === 'sale' ? 'default' : 'outline'}>{op.type === 'sale' ? 'Venta' : 'Compra'}</Badge></TableCell>
                  <TableCell>{op.description}</TableCell>
                  <TableCell>{op.counterpart}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${op.type === 'purchase' ? 'text-destructive' : 'text-success'}`}>{formatCurrency(op.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
