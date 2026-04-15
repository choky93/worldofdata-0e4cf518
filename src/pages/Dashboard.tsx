import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getGreeting, safeDiv } from '@/lib/formatters';
import { findNumber, findString, FIELD_AMOUNT, FIELD_SPEND, FIELD_DATE } from '@/lib/field-utils';
import { parseDate } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodFilter } from '@/components/PeriodFilter';
import {
  TrendingUp, AlertTriangle, DollarSign, Package, Users,
  Megaphone, ArrowUpRight, ArrowRight, ShoppingCart, Wallet, BarChart3,
  FileBox, CheckCircle2, AlertCircle, XCircle, Loader2, Database, Upload,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Safe format helper ──────────────────────────────────────────

function safeFmt(value: number | null, formatter: (v: number) => string, fallback = '—'): string {
  if (value === null || isNaN(value) || !isFinite(value)) return fallback;
  return formatter(value);
}

// ─── Health Radar ────────────────────────────────────────────────────
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

  if (highlights.length === 0) return null;

  return (
    <div className="bg-[#1f2a0f] rounded-xl px-4 py-3 overflow-hidden relative flex items-center border border-[#2a3a1a]">
      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mr-3">
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
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-primary w-4' : 'bg-[#333]'}`}
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

// ─── Data Source Banner ──────────────────────────────────────────────
function DataSourceBanner({ hasData, loading }: { hasData: boolean; loading: boolean }) {
  if (loading) return null;
  return (
    <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 ${hasData ? 'alert-success' : 'bg-card text-muted-foreground border border-border'}`}>
      <Database className="h-3.5 w-3.5 shrink-0" />
      {hasData ? (
        <span>Mostrando datos reales extraídos de tus archivos cargados</span>
      ) : (
        <span>Sin datos cargados. <Link to="/carga-datos" className="underline font-medium">Cargá tus archivos</Link> para ver tus métricas reales.</span>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────
export default function Dashboard() {
  const { profile, companySettings, companyName } = useAuth();
  const navigate = useNavigate();
  const { data: extractedData, mappings, loading: dataLoading, hasData, availableMonths, duplicatedPeriods, hasCurrencyMix } = useExtractedData();
  const mV = mappings.ventas;
  const mG = mappings.gastos;
  const mM = mappings.marketing;
  const [period, setPeriod] = useState<PeriodKey>('all');
  const name = profile?.full_name || 'Usuario';
  const company = companyName || 'tu empresa';
  const showStock = !companySettings || companySettings.has_stock || companySettings.sells_products;
  // Show marketing if configured OR if marketing data actually exists
  const hasMarketingData = (extractedData?.marketing || []).length > 0;
  const showAds = !companySettings || companySettings.uses_meta_ads || companySettings.uses_google_ads || hasMarketingData;

  const allVentas = extractedData?.ventas || [];
  const allGastos = extractedData?.gastos || [];
  const allMarketing = extractedData?.marketing || [];
  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row, kw) => findString(row, kw, mV?.date));
  const realStock = extractedData?.stock || [];
  const realGastos = period === 'all' ? allGastos : filterByPeriod(allGastos, FIELD_DATE, period, (row, kw) => findString(row, kw, mG?.date));
  const realClientes = extractedData?.clientes || [];
  const realMarketing = period === 'all' ? allMarketing : filterByPeriod(allMarketing, FIELD_DATE, period, (row, kw) => findString(row, kw, mM?.date));
  const realOtro = extractedData?.otro || [];

  const salesTotal = hasData && realVentas.length > 0
    ? realVentas.reduce((sum: number, r: any) => sum + findNumber(r, FIELD_AMOUNT, mV?.amount), 0)
    : null;

  const gastosTotal = hasData && realGastos.length > 0
    ? realGastos.reduce((sum: number, r: any) => sum + findNumber(r, FIELD_AMOUNT, mG?.amount), 0)
    : null;

  const marketingSpend = hasData && realMarketing.length > 0
    ? realMarketing.reduce((sum: number, r: any) => sum + findNumber(r, FIELD_SPEND, mM?.spend), 0)
    : null;

  const healthDimensions = [
    { key: 'ventas', label: 'Ventas', icon: ShoppingCart, status: (hasData && realVentas.length > 0 ? 'ok' : 'warning') as 'ok' | 'warning' | 'critical', detail: salesTotal !== null ? `${formatCurrency(salesTotal)} acumulado` : 'Sin datos', url: '/ventas', color: 'var(--module-ventas)' },
    { key: 'finanzas', label: 'Finanzas', icon: Wallet, status: (hasData && realGastos.length > 0 ? 'ok' : 'warning') as 'ok' | 'warning' | 'critical', detail: gastosTotal !== null ? `${formatCurrency(gastosTotal)} en gastos` : 'Sin datos', url: '/finanzas', color: 'var(--module-finanzas)' },
    { key: 'stock', label: 'Stock', icon: Package, status: (hasData && realStock.length > 0 ? 'ok' : 'warning') as 'ok' | 'warning' | 'critical', detail: hasData && realStock.length > 0 ? `${realStock.length} productos cargados` : 'Sin datos', url: '/stock', color: 'var(--module-stock)' },
    { key: 'clientes', label: 'Clientes', icon: Users, status: (hasData && realClientes.length > 0 ? 'ok' : 'warning') as 'ok' | 'warning' | 'critical', detail: hasData && realClientes.length > 0 ? `${realClientes.length} clientes` : 'Sin datos', url: '/clientes', color: 'var(--module-clientes)' },
    { key: 'marketing', label: 'Marketing', icon: Megaphone, status: (hasData && realMarketing.length > 0 ? 'ok' : 'warning') as 'ok' | 'warning' | 'critical', detail: marketingSpend !== null ? `${formatCurrency(marketingSpend)} invertidos` : 'Sin datos', url: '/marketing', color: 'var(--module-marketing)' },
    { key: 'operaciones', label: 'Operaciones', icon: FileBox, status: 'ok' as const, detail: hasData ? `${realVentas.length + realGastos.length} registros` : 'Sin datos', url: '/operaciones', color: 'var(--module-operaciones)' },
  ];

  const highlights: string[] = [];
  if (salesTotal !== null) {
    highlights.push(`Llevás vendido ${formatCurrency(salesTotal)} según tus datos cargados.`);
  }
  if (gastosTotal !== null && salesTotal !== null) {
    const net = salesTotal - gastosTotal;
    highlights.push(`Resultado neto: ${formatCurrency(net)} (ventas menos gastos registrados).`);
  }
  if (realClientes.length > 0) {
    highlights.push(`Tenés ${realClientes.length} clientes cargados en la plataforma.`);
  }
  if (realStock.length > 0) {
    highlights.push(`Tu inventario tiene ${realStock.length} productos registrados.`);
  }
  if (!hasData) {
    highlights.push('Cargá tus archivos en "Carga de datos" para ver tus métricas reales.');
  }

  const visibleHealth = healthDimensions.filter(d => {
    if (d.key === 'stock' && !showStock) return false;
    if (d.key === 'marketing' && !showAds) return false;
    return true;
  });

  // Build sales chart from real data if available — sorted by date
  const salesChartData = (() => {
    if (!hasData || realVentas.length === 0) return [];
    const map = new Map<string, { value: number; date: Date }>();
    for (const r of realVentas) {
      const raw = findString(r, FIELD_DATE, mV?.date);
      if (!raw) continue;
      const d = parseDate(raw);
      if (!d) continue;
      const key = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
      const amt = findNumber(r, FIELD_AMOUNT, mV?.amount);
      const existing = map.get(key);
      if (existing) {
        existing.value += amt;
      } else {
        map.set(key, { value: amt, date: d });
      }
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
      .slice(-30)
      .map(([day, { value }]) => ({ day, value }));
  })();

  return (
    <TooltipProvider>
      <div className="space-y-5 max-w-[1400px]">
        {/* Greeting */}
        <Stagger index={0}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{getGreeting()}, {name.split(' ')[0]}.</h1>
              <p className="text-muted-foreground mt-0.5">Resumen de <span className="font-semibold text-foreground">{company}</span></p>
            </div>
            <PeriodFilter value={period} onChange={setPeriod} availableMonths={availableMonths} />
          </div>
        </Stagger>

        {/* Data source banner */}
        <Stagger index={1}>
          <DataSourceBanner hasData={hasData} loading={dataLoading} />
          {duplicatedPeriods.length > 0 && (
            <div className="rounded-lg px-4 py-2.5 text-xs flex items-start gap-2 alert-warning mt-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>⚠️ Datos posiblemente duplicados:</strong> los períodos{' '}
                {duplicatedPeriods.map(p => {
                  const [y, m] = p.split('-');
                  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
                  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                }).join(', ')}{' '}
                aparecen en más de un archivo cargado. Los totales pueden estar inflados.{' '}
                <Link to="/carga-datos" className="underline font-medium">Revisá tus archivos en Carga de Datos</Link>.
              </span>
            </div>
          )}
          {(hasCurrencyMix.ventas || hasCurrencyMix.gastos) && (
            <div className="rounded-lg px-4 py-2.5 text-xs flex items-start gap-2 alert-warning mt-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>⚠️ Múltiples monedas detectadas</strong> en {[hasCurrencyMix.ventas && 'ventas', hasCurrencyMix.gastos && 'gastos'].filter(Boolean).join(' y ')}.
                Los totales mostrados pueden no ser precisos. Recomendamos cargar archivos separados por moneda.
              </span>
            </div>
          )}
          {realOtro.length > 0 && (
            <div className="rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 alert-warning mt-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Hay <strong>{realOtro.length}</strong> filas que no pudieron clasificarse automáticamente. 
                <Link to="/carga-datos" className="underline font-medium ml-1">Revisá en Carga de datos</Link> para reprocesarlas.
              </span>
            </div>
          )}
        </Stagger>

        {/* Ticker */}
        {highlights.length > 0 && (
          <Stagger index={2}>
            <TickerBar highlights={highlights} />
          </Stagger>
        )}

        {/* Health Radar */}
        <Stagger index={3}>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {visibleHealth.map((dim) => (
              <button
                key={dim.key}
                onClick={() => navigate(dim.url)}
                className={`module-border-${dim.key} rounded-xl bg-card border border-border p-3 text-left transition-all duration-200 hover:border-[#3a3a3a]`}
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

        {/* KPIs */}
        <Stagger index={4}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/ventas">
              <Card className="module-border-ventas transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Ventas</span>
                  </div>
                  {salesTotal !== null ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <p className="kpi-value">{formatCurrency(salesTotal)}</p>
                        {hasCurrencyMix.ventas && (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="text-warning cursor-help">⚠️</span></TooltipTrigger>
                            <TooltipContent><p className="text-xs">Incluye múltiples monedas</p></TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{realVentas.length} {realVentas.length === 1 ? 'período' : 'períodos'}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Link to="/finanzas">
              <Card className="module-border-finanzas transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Gastos cargados</span>
                  </div>
                  {gastosTotal !== null ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <p className="kpi-value">{formatCurrency(gastosTotal)}</p>
                        {hasCurrencyMix.gastos && (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="text-warning cursor-help">⚠️</span></TooltipTrigger>
                            <TooltipContent><p className="text-xs">Incluye múltiples monedas</p></TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{realGastos.length} registros</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Link to="/finanzas">
              <Card className="transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Resultado neto</span>
                  </div>
                  {salesTotal !== null && gastosTotal !== null ? (
                    <>
                      <p className={`kpi-value ${salesTotal - gastosTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(salesTotal - gastosTotal)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">Ventas − Gastos</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            {showAds && (
              <Link to="/marketing">
                <Card className="module-border-marketing transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                      <Megaphone className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">Marketing</span>
                    </div>
                    {marketingSpend !== null ? (
                      <>
                        <p className="kpi-value">{formatCurrency(marketingSpend)}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">gasto en publicidad</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin datos</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </Stagger>

        {/* Sales Chart — only if there's real data */}
        {salesChartData.length >= 2 && (
          <Stagger index={5}>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Ventas por mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesChartData}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c8f135" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#c8f135" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#555555' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#555555' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#f5f5f5' }} itemStyle={{ color: '#c8f135' }} />
                      <Area type="monotone" dataKey="value" stroke="#c8f135" fill="url(#salesGrad)" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </Stagger>
        )}

        {/* Empty CTA — only shown when no data at all */}
        {!hasData && !dataLoading && (
          <Stagger index={5}>
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                <Upload className="h-10 w-10 text-muted-foreground/30" />
                <div>
                  <p className="font-medium">Cargá tus primeros archivos</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Subí tus Excel de ventas, PDFs de facturas, CSVs de stock o cualquier reporte de tu empresa.
                    La plataforma los procesa automáticamente con IA.
                  </p>
                </div>
                <Link to="/carga-datos">
                  <Button className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Ir a Carga de datos
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </Stagger>
        )}

        {/* Stock + Clientes summary */}
        {hasData && (realStock.length > 0 || realClientes.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {showStock && realStock.length > 0 && (
              <Stagger index={6}>
                <Link to="/stock">
                  <Card className="module-border-stock transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                        <Package className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Inventario</span>
                      </div>
                      <p className="text-sm">{realStock.length} productos cargados</p>
                      <p className="text-xs text-muted-foreground mt-1">Ver detalle en Stock →</p>
                    </CardContent>
                  </Card>
                </Link>
              </Stagger>
            )}
            {realClientes.length > 0 && (
              <Stagger index={7}>
                <Link to="/clientes">
                  <Card className="module-border-clientes transition-all cursor-pointer h-full hover:border-[#3a3a3a]">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                        <Users className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Clientes</span>
                      </div>
                      <p className="text-sm">{realClientes.length} clientes cargados</p>
                      <p className="text-xs text-muted-foreground mt-1">Ver detalle en Clientes →</p>
                    </CardContent>
                  </Card>
                </Link>
              </Stagger>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
