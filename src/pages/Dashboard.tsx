import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatPercent, getGreeting } from '@/lib/formatters';
import {
  mockSalesCurrentMonth, mockProfit, mockCashFlow, mockAds, mockExpenses,
  mockProducts, mockClients, mockAlerts, mockDailySales, mockCompany,
} from '@/lib/mock-data';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Users, Megaphone, FileText, ArrowUpRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

function StatusBadge({ status }: { status: 'ok' | 'low' | 'overstock' }) {
  if (status === 'ok') return <Badge className="bg-success/15 text-success border-0">OK</Badge>;
  if (status === 'low') return <Badge className="bg-destructive/15 text-destructive border-0">Faltante</Badge>;
  return <Badge className="bg-warning/15 text-warning border-0">Sobrestock</Badge>;
}

function ExpenseStatus({ status }: { status: 'paid' | 'pending' | 'overdue' }) {
  if (status === 'paid') return <Badge className="bg-success/15 text-success border-0">Pagado</Badge>;
  if (status === 'pending') return <Badge className="bg-warning/15 text-warning border-0">Pendiente</Badge>;
  return <Badge className="bg-destructive/15 text-destructive border-0">Vencido</Badge>;
}

export default function Dashboard() {
  const { profile, companySettings, companyName } = useAuth();
  const name = profile?.full_name || 'Usuario';
  const company = companyName || mockCompany.name;
  const showStock = !companySettings || companySettings.has_stock || companySettings.sells_products;
  const showAds = !companySettings || companySettings.uses_meta_ads || companySettings.uses_google_ads;

  const highlights = [
    `Llevás vendido ${formatCurrency(mockSalesCurrentMonth.accumulated)} en marzo. Estás un 12% arriba del mismo período del año pasado.`,
    `Tenés ${formatCurrency(mockCashFlow.pendingCollections)} pendientes de cobro de 3 clientes.`,
    showStock ? `Tu stock de Impresora Ender 3 V3 alcanza para 10 días. Tu proveedor tarda 15.` : null,
  ].filter(Boolean);

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold">{getGreeting()}, {name.split(' ')[0]}.</h1>
          <p className="text-muted-foreground mt-1">Acá va tu resumen de <span className="font-medium text-foreground">{company}</span>.</p>
        </div>

        {/* Highlights */}
        <div className="bg-primary/5 rounded-xl p-4 space-y-2">
          {highlights.map((h, i) => (
            <p key={i} className="text-sm flex items-start gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              {h}
            </p>
          ))}
        </div>

        {/* Top KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Ventas */}
          <Link to="/ventas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Ventas del Mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockSalesCurrentMonth.accumulated)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={mockSalesCurrentMonth.progressPercent} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground tabular-nums">{mockSalesCurrentMonth.progressPercent}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Estimado: {formatCurrency(mockSalesCurrentMonth.estimated)}
                  <span className="ml-2 text-success">
                    <TrendingUp className="h-3 w-3 inline" /> +12% vs año anterior
                  </span>
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Ganancia */}
          <Link to="/finanzas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Ganancia
                  <Tooltip>
                    <TooltipTrigger asChild><span className="text-xs cursor-help">ⓘ</span></TooltipTrigger>
                    <TooltipContent><p className="text-xs">Ventas - Costos variables - Costos fijos</p></TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockProfit.netProfit)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Margen: <span className="font-medium text-foreground">{formatPercent(mockProfit.marginPercent)}</span>
                </p>
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <p>Ventas: {formatCurrency(mockProfit.totalSales)}</p>
                  <p>Costos variables: -{formatCurrency(mockProfit.variableCosts)}</p>
                  <p>Costos fijos: -{formatCurrency(mockProfit.fixedCosts)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Flujo de Caja */}
          <Link to="/finanzas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Flujo de Caja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{formatCurrency(mockCashFlow.availableToday)}</p>
                <p className="text-xs text-muted-foreground mt-1">Disponible hoy</p>
                <div className={`mt-3 rounded-lg p-3 text-sm ${
                  mockCashFlow.status === 'warning' ? 'bg-warning/10 text-warning' :
                  'bg-destructive/10 text-destructive'
                }`}>
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  A fin de mes estimamos {formatCurrency(mockCashFlow.estimatedEndOfMonth)} en caja
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Sales Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas diarias — Marzo 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockDailySales}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 71%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(217, 71%, 45%)" fill="url(#salesGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Second Row */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Ads (conditional) */}
          {showAds && (
            <Link to="/marketing">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Megaphone className="h-4 w-4" /> Inversión Publicitaria
                    <Tooltip>
                      <TooltipTrigger asChild><span className="text-xs cursor-help">ⓘ</span></TooltipTrigger>
                      <TooltipContent><p className="text-xs">ROAS = Retorno sobre inversión publicitaria (ingresos / gasto en ads)</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{formatCurrency(mockAds.totalSpend)}</p>
                  <p className="text-sm mt-1">ROAS: <span className="font-bold text-success">{mockAds.roas}x</span></p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <TrendingUp className="h-3 w-3 inline text-success" /> +15.6% vs mes anterior
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Gastos previstos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" /> Gastos Previstos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {mockExpenses.slice(0, 4).map((exp, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{exp.name}</span>
                    <span className="tabular-nums font-medium mx-3">{formatCurrency(exp.amount)}</span>
                    <ExpenseStatus status={exp.status} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Total pendiente: <span className="font-medium">{formatCurrency(mockExpenses.filter(e => e.status !== 'paid').reduce((s, e) => s + e.amount, 0))}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Third Row */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Stock */}
          {showStock && (
            <Link to="/stock">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" /> Stock Consolidado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {mockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="tabular-nums mx-3">{p.stock} uds</span>
                        <StatusBadge status={p.status} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 bg-warning/10 rounded p-2">
                    ⚡ Sobrestock de PLA: vendé 45 unidades para liberar capital
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Clientes */}
          <Link to="/clientes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" /> Clientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold mb-3">
                  Cobros pendientes: <span className="text-destructive">{formatCurrency(mockClients.reduce((s, c) => s + c.pendingPayment, 0))}</span>
                </p>
                <div className="space-y-2">
                  {mockClients.slice(0, 3).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{c.name}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(c.totalPurchases)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Producto estrella: <span className="font-medium text-foreground">Filamento PLA 1kg</span>
                </p>
                <p className="text-xs text-warning mt-1">
                  ⚠ El 47% de tus ventas depende de 2 clientes
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Alerts Preview */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas recientes</CardTitle>
            <Link to="/alertas" className="text-xs text-primary hover:underline">Ver todas →</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockAlerts.filter(a => !a.read).slice(0, 3).map((alert) => (
                <div key={alert.id} className={`text-sm p-3 rounded-lg border-l-4 ${
                  alert.priority === 'high' ? 'border-l-destructive bg-destructive/5' :
                  alert.priority === 'medium' ? 'border-l-warning bg-warning/5' :
                  'border-l-primary bg-primary/5'
                }`}>
                  {alert.message}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
