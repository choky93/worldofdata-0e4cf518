import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatters';
import { mockAds } from '@/lib/mock-data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export default function Marketing() {
  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Marketing — Inversión Publicitaria</h1>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Gasto total del mes</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockAds.totalSpend)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              ROAS global
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Return On Ad Spend = Ingresos generados / Gasto en publicidad. Un ROAS de 4x significa que por cada $1 invertido generás $4.</p></TooltipContent>
              </Tooltip>
            </p>
            <p className="text-3xl font-bold text-success">{mockAds.roas}x</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">vs mes anterior</p>
            <p className="text-xl font-bold flex items-center gap-1"><TrendingUp className="h-4 w-4 text-success" /> +15.6%</p>
          </CardContent></Card>
        </div>

        {/* Performance chart */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Gasto vs Ingresos (últimos 6 meses)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockAds.monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="spend" name="Gasto" fill="hsl(var(--destructive))" opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="revenue" name="Ingresos" fill="hsl(var(--primary))" opacity={0.8} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Evolución del ROAS</CardTitle></CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockAds.monthlyPerformance}>
                    <defs>
                      <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}x`} domain={[0, 'auto']} />
                    <RTooltip formatter={(v: number) => `${v}x`} />
                    <Area type="monotone" dataKey="roas" stroke="hsl(var(--success))" fill="url(#roasGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Desglose por campaña</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    ROAS
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Retorno sobre inversión publicitaria</p></TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    CTR
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Click-Through Rate: porcentaje de personas que vieron el anuncio y hicieron click</p></TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead className="text-right">Conversiones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {mockAds.campaigns.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{c.roas}x</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(c.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.conversions}</TableCell>
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
