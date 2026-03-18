import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';
import { mockAds } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp } from 'lucide-react';

export default function Marketing() {
  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Marketing — Inversión Publicitaria</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Gasto total del mes</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockAds.totalSpend)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">ROAS global</p>
          <p className="text-3xl font-bold text-success">{mockAds.roas}x</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">vs mes anterior</p>
          <p className="text-xl font-bold flex items-center gap-1"><TrendingUp className="h-4 w-4 text-success" /> +15.6%</p>
        </CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Desglose por campaña</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Campaña</TableHead><TableHead className="text-right">Gasto</TableHead>
              <TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">ROAS</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mockAds.campaigns.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{c.roas}x</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
