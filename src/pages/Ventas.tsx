import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockMonthlySales, mockDailySales, mockSalesCurrentMonth } from '@/lib/mock-data';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp } from 'lucide-react';

const salesHistory = [
  { date: '2026-03-15', client: 'TecnoPlast SRL', product: 'Filamento PLA 1kg x50', amount: 425000 },
  { date: '2026-03-14', client: 'MakerSpace BA', product: 'Impresora Ender 3 V3', amount: 350000 },
  { date: '2026-03-12', client: 'Proto Ingeniería', product: 'Servicio impresión industrial', amount: 420000 },
  { date: '2026-03-10', client: 'Diseño 3D Studio', product: 'Filamento PETG + ABS', amount: 185000 },
  { date: '2026-03-08', client: 'FabLab Córdoba', product: 'Repuestos varios', amount: 92000 },
  { date: '2026-03-05', client: 'TecnoPlast SRL', product: 'Resina UV 1L x10', amount: 220000 },
  { date: '2026-03-02', client: 'Dental3D', product: 'Filamento PLA 1kg x20', amount: 170000 },
];

export default function Ventas() {
  const yoyChange = ((mockSalesCurrentMonth.accumulated - mockSalesCurrentMonth.previousYearSameMonth) / mockSalesCurrentMonth.previousYearSameMonth * 100).toFixed(0);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Acumulado mes</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockSalesCurrentMonth.accumulated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Estimado mes</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockSalesCurrentMonth.estimated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Falta vender</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockSalesCurrentMonth.estimated - mockSalesCurrentMonth.accumulated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              vs año anterior
              <UITooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Comparación con el mismo mes del año pasado ({formatCurrency(mockSalesCurrentMonth.previousYearSameMonth)})</p></TooltipContent>
              </UITooltip>
            </p>
            <p className="text-2xl font-bold text-success flex items-center gap-1">
              <TrendingUp className="h-5 w-5" /> +{yoyChange}%
            </p>
          </CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Ventas diarias — Marzo 2026</CardTitle></CardHeader>
            <CardContent><div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockDailySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Evolución mensual</CardTitle></CardHeader>
            <CardContent><div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockMonthlySales}>
                  <defs>
                    <linearGradient id="salesMonthlyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#salesMonthlyGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Historial de ventas</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Monto</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {salesHistory.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="tabular-nums">{formatDate(s.date)}</TableCell>
                    <TableCell className="font-medium">{s.client}</TableCell>
                    <TableCell className="text-muted-foreground">{s.product}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.amount)}</TableCell>
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
