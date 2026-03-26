import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockMonthlySales, mockDailySales, mockSalesCurrentMonth } from '@/lib/mock-data';
import { useExtractedData } from '@/hooks/useExtractedData';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Ventas() {
  const { data: extractedData, hasData } = useExtractedData();
  const realVentas = extractedData?.ventas || [];

  // Try to build real sales data
  const realSalesTotal = hasData && realVentas.length > 0
    ? realVentas.reduce((sum: number, r: any) => {
        const val = parseFloat(r.monto || r.total || r.amount || r.valor || r.importe || 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0)
    : null;

  const salesHistory = hasData && realVentas.length > 0
    ? realVentas.slice(0, 20).map((r: any, i: number) => ({
        date: r.fecha || r.date || '—',
        client: r.cliente || r.client || r.nombre || '—',
        product: r.producto || r.detalle || r.descripcion || r.product || '—',
        amount: parseFloat(r.monto || r.total || r.amount || r.valor || r.importe || 0) || 0,
      }))
    : [
        { date: '2026-03-15', client: 'TecnoPlast SRL', product: 'Filamento PLA 1kg x50', amount: 425000 },
        { date: '2026-03-14', client: 'MakerSpace BA', product: 'Impresora Ender 3 V3', amount: 350000 },
        { date: '2026-03-12', client: 'Proto Ingeniería', product: 'Servicio impresión industrial', amount: 420000 },
        { date: '2026-03-10', client: 'Diseño 3D Studio', product: 'Filamento PETG + ABS', amount: 185000 },
        { date: '2026-03-08', client: 'FabLab Córdoba', product: 'Repuestos varios', amount: 92000 },
        { date: '2026-03-05', client: 'TecnoPlast SRL', product: 'Resina UV 1L x10', amount: 220000 },
        { date: '2026-03-02', client: 'Dental3D', product: 'Filamento PLA 1kg x20', amount: 170000 },
      ];

  const accumulated = realSalesTotal ?? mockSalesCurrentMonth.accumulated;
  const estimated = realSalesTotal ? Math.round(realSalesTotal * 1.6) : mockSalesCurrentMonth.estimated;
  const prevYear = mockSalesCurrentMonth.previousYearSameMonth;
  const yoyChange = ((accumulated - prevYear) / prevYear * 100).toFixed(0);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ventas</h1>
          {hasData && realVentas.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 rounded-lg px-3 py-1.5 border border-success/20">
              <Database className="h-3.5 w-3.5" />
              Datos reales ({realVentas.length} registros)
            </div>
          )}
          {(!hasData || realVentas.length === 0) && (
            <Link to="/carga-datos" className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5 border border-border hover:text-primary transition-colors">
              <Database className="h-3.5 w-3.5" />
              Datos de ejemplo — Cargá tus archivos
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Acumulado mes</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(accumulated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Estimado mes</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(estimated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Falta vender</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(estimated - accumulated)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              vs año anterior
              <UITooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Comparación con el mismo mes del año pasado ({formatCurrency(prevYear)})</p></TooltipContent>
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
                    <TableCell className="tabular-nums">{s.date !== '—' ? formatDate(s.date) : '—'}</TableCell>
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
