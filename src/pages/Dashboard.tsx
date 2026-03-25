import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatPercent, getGreeting } from '@/lib/formatters';
import {
  mockSalesCurrentMonth, mockProfit, mockCashFlow, mockAds,
  mockProducts, mockClients, mockAlerts, mockDailySales, mockCompany,
} from '@/lib/mock-data';
import {
  TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Users,
  Megaphone, ArrowUpRight, ArrowRight, ShoppingCart, Wallet, BarChart3,
  FileBox, CheckCircle2, AlertCircle, XCircle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Health Radar ────────────────────────────────────────────────────
const healthDimensions = [
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart, status: 'ok' as const, detail: '+12% vs año anterior', url: '/ventas', color: 'var(--module-ventas)' },
  { key: 'finanzas', label: 'Finanzas', icon: Wallet, status: 'warning' as const, detail: 'Flujo de caja ajustado', url: '/finanzas', color: 'var(--module-finanzas)' },
  { key: 'stock', label: 'Stock', icon: Package, status: 'critical' as const, detail: '2 productos en faltante', url: '/stock', color: 'var(--module-stock)' },
  { key: 'clientes', label: 'Clientes', icon: Users, status: 'warning' as const, detail: '47% concentración', url: '/clientes', color: 'var(--module-clientes)' },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, status: 'ok' as const, detail: 'ROAS 4.2x', url: '/marketing', color: 'var(--module-marketing)' },
  { key: 'operaciones', label: 'Operaciones', icon: FileBox, status: 'ok' as const, detail: 'Sin novedades', url: '/operaciones', color: 'var(--module-operaciones)' },
];

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === 'warning') return <AlertCircle className="h-4 w-4 text-warning" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

// ─── Ticker ──────────────────────────────────────────────────────────
function TickerBar({ highlights }: { highlights: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (highlights.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % highlights.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [highlights.length]);

  return (
    <div className="bg-primary/[0.06] rounded-xl px-4 py-3 overflow-hidden relative flex items-center border border-primary/10">
      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mr-3">
        <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35 }}
          className="text-sm flex-1"
        >
          {highlights[currentIndex]}
        </motion.p>
      </AnimatePresence>
      {highlights.length > 1 && (
        <div className="flex gap-1.5 ml-3 shrink-0">
          {highlights.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-primary w-4' : 'bg-primary/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stagger wrapper ─────────────────────────────────────────────────
function Stagger({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────
export default function Dashboard() {
  const { profile, companySettings, companyName } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name || 'Usuario';
  const company = companyName || mockCompany.name;
  const showStock = !companySettings || companySettings.has_stock || companySettings.sells_products;
  const showAds = !companySettings || companySettings.uses_meta_ads || companySettings.uses_google_ads;

  const highlights = [
    `Llevás vendido ${formatCurrency(mockSalesCurrentMonth.accumulated)} en marzo. Estás un 12% arriba del mismo período del año pasado.`,
    `Tenés ${formatCurrency(mockCashFlow.pendingCollections)} pendientes de cobro de 3 clientes.`,
    showStock ? `Tu stock de Impresora Ender 3 V3 alcanza para 10 días. Tu proveedor tarda 15.` : null,
    `Tu ROAS promedio es ${mockAds.roas}x — un 15.6% mejor que el mes pasado.`,
  ].filter(Boolean) as string[];

  const chartData = mockDailySales.map(d => ({
    day: d.day,
    value: d.projected ? undefined : d.value,
    projected: d.projected ? d.value : (d === mockDailySales.filter(x => !x.projected).at(-1) ? d.value : undefined),
  }));

  const decisions = mockAlerts.filter(a => !a.read && a.suggestion).slice(0, 3);

  const visibleHealth = healthDimensions.filter(d => {
    if (d.key === 'stock' && !showStock) return false;
    if (d.key === 'marketing' && !showAds) return false;
    return true;
  });

  return (
    <TooltipProvider>
      <div className="space-y-5 max-w-[1400px]">
        {/* Greeting */}
        <Stagger index={0}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{getGreeting()}, {name.split(' ')[0]}.</h1>
            <p className="text-muted-foreground mt-0.5">Resumen de <span className="font-semibold text-foreground">{company}</span></p>
          </div>
        </Stagger>

        {/* Ticker */}
        <Stagger index={1}>
          <TickerBar highlights={highlights} />
        </Stagger>

        {/* Health Radar */}
        <Stagger index={2}>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {visibleHealth.map((dim) => (
              <button
                key={dim.key}
                onClick={() => navigate(dim.url)}
                className={`module-border-${dim.key} rounded-xl bg-card/70 backdrop-blur-sm border border-border/50 p-3 text-left hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StatusIcon status={dim.status} />
                  <span className="text-xs font-semibold truncate">{dim.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight truncate">{dim.detail}</p>
              </button>
            ))}
          </div>
        </Stagger>

        {/* Compact KPIs */}
        <Stagger index={3}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Link to="/ventas">
              <Card className="module-border-ventas hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Ventas del Mes</span>
                  </div>
                  <p className="kpi-value">{formatCurrency(mockSalesCurrentMonth.accumulated)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Progress value={mockSalesCurrentMonth.progressPercent} className="h-1.5 flex-1" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{mockSalesCurrentMonth.progressPercent}%</span>
                  </div>
                  <p className="text-[11px] text-success mt-1 flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" /> +12% vs año anterior
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/finanzas">
              <Card className="module-border-finanzas hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Ganancia</span>
                    <Tooltip>
                      <TooltipTrigger asChild><span className="text-[10px] cursor-help">ⓘ</span></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Ventas - Costos variables - Costos fijos</p></TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="kpi-value">{formatCurrency(mockProfit.netProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Margen: <span className="font-semibold text-foreground">{formatPercent(mockProfit.marginPercent)}</span>
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/finanzas">
              <Card className="hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Flujo de Caja</span>
                  </div>
                  <p className="kpi-value">{formatCurrency(mockCashFlow.availableToday)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Disponible hoy</p>
                  <div className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] flex items-center gap-1 ${
                    mockCashFlow.status === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
                  }`}>
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Fin de mes: {formatCurrency(mockCashFlow.estimatedEndOfMonth)}
                  </div>
                </CardContent>
              </Card>
            </Link>

            {showAds && (
              <Link to="/marketing">
                <Card className="module-border-marketing hover:shadow-lg transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                      <Megaphone className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">Ads</span>
                      <Tooltip>
                        <TooltipTrigger asChild><span className="text-[10px] cursor-help">ⓘ</span></TooltipTrigger>
                        <TooltipContent><p className="text-xs">ROAS = Ingresos / Gasto en publicidad</p></TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="kpi-value">{formatCurrency(mockAds.totalSpend)}</p>
                    <p className="text-xs mt-1">ROAS: <span className="font-bold text-success">{mockAds.roas}x</span></p>
                    <p className="text-[11px] text-success mt-0.5 flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3" /> +15.6% vs mes anterior
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </Stagger>

        {/* Sales Chart */}
        <Stagger index={4}>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Ventas diarias — Marzo 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.08} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => formatCurrency(v)} />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#salesGrad)" strokeWidth={2.5} connectNulls={false} />
                    <Area type="monotone" dataKey="projected" stroke="hsl(var(--primary))" fill="url(#projGrad)" strokeWidth={2} strokeDasharray="6 4" connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-primary rounded inline-block" /> Real</span>
                <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block" style={{ borderTop: '2px dashed hsl(var(--primary))', height: 0 }} /> Proyección</span>
              </div>
            </CardContent>
          </Card>
        </Stagger>

        {/* Decisions of the day + Stock */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Stagger index={5}>
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="h-3 w-3 text-primary" />
                  </span>
                  Hoy deberías...
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {decisions.map((alert, i) => (
                    <div key={alert.id} className={`text-sm p-3 rounded-lg border-l-4 ${
                      alert.priority === 'high' ? 'border-l-destructive bg-destructive/[0.04]' :
                      alert.priority === 'medium' ? 'border-l-warning bg-warning/[0.04]' :
                      'border-l-primary bg-primary/[0.04]'
                    }`}>
                      <p className="text-[13px] leading-snug">{alert.suggestion}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 italic">{alert.message}</p>
                    </div>
                  ))}
                </div>
                <Link to="/alertas" className="text-xs text-primary hover:underline mt-3 inline-flex items-center gap-1">
                  Ver todas las alertas <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          </Stagger>

          <Stagger index={6}>
            <div className="grid gap-3 grid-rows-2 h-full">
              {showStock && (
                <Link to="/stock">
                  <Card className="module-border-stock hover:shadow-lg transition-all cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                        <Package className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Stock Crítico</span>
                      </div>
                      <div className="space-y-1.5">
                        {mockProducts.filter(p => p.status !== 'ok').slice(0, 3).map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-[13px]">
                            <span className="truncate flex-1">{p.name}</span>
                            <span className="tabular-nums mx-2 text-muted-foreground">{p.stock} uds</span>
                            <Badge className={`text-[10px] h-5 ${p.status === 'low' ? 'bg-destructive/15 text-destructive border-0' : 'bg-warning/15 text-warning border-0'}`}>
                              {p.status === 'low' ? 'Faltante' : 'Sobrestock'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}

              <Link to="/clientes">
                <Card className="module-border-clientes hover:shadow-lg transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                      <Users className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">Cobros Pendientes</span>
                    </div>
                    <p className="kpi-value text-destructive">{formatCurrency(mockClients.reduce((s, c) => s + c.pendingPayment, 0))}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      de {mockClients.filter(c => c.pendingPayment > 0).length} clientes
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </Stagger>
        </div>
      </div>
    </TooltipProvider>
  );
}
