import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockClients } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { AlertTriangle, Users, Crown, Award, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function LevelBadge({ level }: { level: 'premium' | 'gold' | 'silver' | 'standard' }) {
  const config = {
    premium: { label: 'Premium', class: 'bg-primary/15 text-primary', icon: Crown },
    gold: { label: 'Gold', class: 'bg-warning/15 text-warning', icon: Award },
    silver: { label: 'Silver', class: 'bg-muted text-muted-foreground', icon: Star },
    standard: { label: 'Standard', class: 'bg-secondary text-secondary-foreground', icon: Star },
  };
  const c = config[level];
  return <Badge className={`border-0 ${c.class}`}><c.icon className="h-3 w-3 mr-1" />{c.label}</Badge>;
}

export default function Clientes() {
  const totalPending = mockClients.reduce((s, c) => s + c.pendingPayment, 0);
  const totalSales = mockClients.reduce((s, c) => s + c.totalPurchases, 0);
  const top2Pct = ((mockClients[0].totalPurchases + mockClients[1].totalPurchases) / totalSales * 100).toFixed(0);
  const churnRiskCount = mockClients.filter(c => c.churnRisk).length;

  const chartData = mockClients.slice(0, 6).map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
    compras: c.totalPurchases,
  }));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="grid gap-4 md:grid-cols-4">
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
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Riesgo de churn
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Clientes que no compraron en los últimos 30 días o con frecuencia en descenso</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold text-destructive">{churnRiskCount}</p>
            <p className="text-xs text-muted-foreground">clientes en riesgo</p>
          </CardContent></Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Compras por cliente (top 6)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="compras" fill="url(#barGrad)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Churn risk alert */}
        {churnRiskCount > 0 && (
          <div className="bg-destructive/5 border-l-4 border-l-destructive rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Clientes en riesgo de abandono</p>
              <p className="text-sm text-muted-foreground mt-1">
                {mockClients.filter(c => c.churnRisk).map(c => c.name).join(', ')} no compran hace más de 30 días. Contactalos para retenerlos.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Cartera de clientes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead className="text-right">Compras totales</TableHead>
                <TableHead className="text-right">Ticket promedio</TableHead>
                <TableHead className="text-right">Frecuencia</TableHead>
                <TableHead className="text-right">Deuda</TableHead>
                <TableHead>Última compra</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {mockClients.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><LevelBadge level={c.level} /></TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.totalPurchases)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.avgTicket)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.purchaseCount} compras</TableCell>
                    <TableCell className={`text-right tabular-nums ${c.pendingPayment > 0 ? 'text-destructive font-medium' : ''}`}>
                      {c.pendingPayment > 0 ? formatCurrency(c.pendingPayment) : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(c.lastPurchase)}</TableCell>
                    <TableCell>
                      {c.churnRisk && (
                        <Tooltip>
                          <TooltipTrigger><AlertTriangle className="h-4 w-4 text-destructive" /></TooltipTrigger>
                          <TooltipContent><p className="text-xs">Riesgo de churn: sin compras recientes</p></TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
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
