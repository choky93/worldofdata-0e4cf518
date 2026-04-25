import { useState, useEffect } from 'react';
import { usePeriod } from '@/contexts/PeriodContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/formatters';
import { findNumber, findDateRaw, FIELD_AMOUNT, FIELD_SPEND, FIELD_DATE, FIELD_STOCK_MIN, getStockUnits, getProductName, getQuantity, dedupeStockRows } from '@/lib/field-utils';
import { aggregateSalesByMonth, buildForecast } from '@/lib/forecast-engine';
import { parseDate, filterByPeriod } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { Topbar } from '@/components/layout/Topbar';
import { ResumenEjecutivoCard } from '@/components/dashboard/ResumenEjecutivoCard';
import { VentasMesCard } from '@/components/dashboard/VentasMesCard';
import { GananciaCard } from '@/components/dashboard/GananciaCard';
import { FlujoCajaCard } from '@/components/dashboard/FlujoCajaCard';
import { ForecastCard } from '@/components/dashboard/ForecastCard';
import { StockCard } from '@/components/dashboard/StockCard';
import { InversionPublicitariaCard } from '@/components/dashboard/InversionPublicitariaCard';
import { AlertTriangle, Database, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FreshnessPill } from '@/components/FreshnessPill';
import { CATEGORY_LABELS, type CategoryKey } from '@/lib/category-modules';

function Stagger({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

export default function Dashboard() {
  const { profile, companySettings, companyName } = useAuth();
  const { data: extractedData, mappings, loading: dataLoading, hasData, availableMonths, duplicatedPeriods, hasCurrencyMix, detectedCurrencies, lastUploadDates } = useExtractedData();
  const mV = mappings.ventas;
  const mG = mappings.gastos;
  const mM = mappings.marketing;
  const { period, setPeriod } = usePeriod();
  const navigate = useNavigate();
  const name = profile?.full_name?.split(' ')[0] || 'Usuario';
  const company = companyName || 'tu empresa';
  const showStock = !companySettings || companySettings.has_stock || companySettings.sells_products;
  const hasMarketingData = (extractedData?.marketing || []).length > 0;
  const showAds = !companySettings || companySettings.uses_meta_ads || companySettings.uses_google_ads || hasMarketingData;
  const [duplicateBannerDismissed, setDuplicateBannerDismissed] = useState(false);

  useEffect(() => {
    setDuplicateBannerDismissed(false);
  }, [duplicatedPeriods.join('|')]);

  const allVentas = extractedData?.ventas || [];
  const allGastos = extractedData?.gastos || [];
  const allMarketing = extractedData?.marketing || [];
  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, mV?.date));
  const realStock = extractedData?.stock || [];
  const realGastos = period === 'all' ? allGastos : filterByPeriod(allGastos, FIELD_DATE, period, (row) => findDateRaw(row, mG?.date));
  const realMarketing = period === 'all' ? allMarketing : filterByPeriod(allMarketing, FIELD_DATE, period, (row) => findDateRaw(row, mM?.date));
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

  const ganancia = (salesTotal !== null && gastosTotal !== null) ? salesTotal - gastosTotal : null;
  const margenPct = (salesTotal !== null && gastosTotal !== null && salesTotal > 0)
    ? ((salesTotal - gastosTotal) / salesTotal) * 100
    : null;

  // Highlights for resumen ejecutivo
  const highlights: string[] = [];
  if (salesTotal !== null) {
    highlights.push(`Ventas del período: ${formatCurrency(salesTotal)} en ${realVentas.length} registros.`);
  }
  if (ganancia !== null) {
    highlights.push(`Resultado neto: ${formatCurrency(ganancia)}${margenPct !== null ? ` (margen ${margenPct.toFixed(1)}%)` : ''}.`);
  }
  if (realStock.length > 0) {
    highlights.push(`Inventario: ${realStock.length} productos registrados.`);
  }
  if (marketingSpend !== null) {
    highlights.push(`Inversión publicitaria: ${formatCurrency(marketingSpend)}.`);
  }
  if (!hasData) {
    highlights.push('Cargá tus archivos en "Carga de datos" para ver tu resumen real.');
  }

  // Sales chart by month, sorted
  const salesChartData = (() => {
    if (!hasData || realVentas.length === 0) return [];
    const map = new Map<string, { value: number; date: Date }>();
    for (const r of realVentas) {
      const raw = findDateRaw(r, mV?.date);
      if (!raw) continue;
      const d = parseDate(raw);
      if (!d) continue;
      const key = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', '');
      const amt = findNumber(r, FIELD_AMOUNT, mV?.amount);
      const existing = map.get(key);
      if (existing) existing.value += amt;
      else map.set(key, { value: amt, date: d });
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
      .map(([day, { value }]) => ({ day, value }));
  })();

  // Forecast: usa el mismo motor que la página Forecast (WMA + estacionalidad)
  // para que los números del dashboard coincidan con los de la página dedicada.
  const forecastData = (() => {
    const salesHistory = aggregateSalesByMonth(allVentas, mV?.date, mV?.amount);
    if (salesHistory.length < 2) return [] as { day: string; real: number | null; proyectado: number | null }[];
    const { chartData } = buildForecast(salesHistory);
    // Últimos 6 reales + hasta 3 proyectados. buildForecast ya maneja el bridge:
    // el último punto real tiene tanto `real` como `forecast` seteados.
    const last9 = chartData.slice(-9);
    return last9.map(p => ({
      day: p.month,
      real: p.real ?? null,
      proyectado: p.forecast ?? null,
    }));
  })();

  // Stock breakdown — clasificar PRODUCTOS por días de cobertura (igual que Stock.tsx)
  const stockBreakdown = (() => {
    if (realStock.length === 0) return { ok: 0, bajo: 0, critico: 0 };
    const mS = mappings.stock;
    const dedup = dedupeStockRows(realStock, mS?.name, mS?.stock_qty);

    // Build avg monthly units by product from ALL ventas (unfiltered by period)
    const totals = new Map<string, number>();
    const activeMonths = new Map<string, Set<string>>();
    for (const r of allVentas) {
      const name = getProductName(r, mV?.name);
      if (!name) continue;
      const qty = getQuantity(r, mV?.quantity);
      if (!qty || qty <= 0) continue;
      const key = name.trim().toLowerCase();
      totals.set(key, (totals.get(key) || 0) + qty);
      const raw = findDateRaw(r, mV?.date);
      const d = parseDate(raw);
      if (d) {
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!activeMonths.has(key)) activeMonths.set(key, new Set());
        activeMonths.get(key)!.add(month);
      }
    }
    const avgByProduct = new Map<string, number>();
    for (const [k, total] of totals) {
      avgByProduct.set(k, total / (activeMonths.get(k)?.size || 1));
    }

    const LEAD = 20;
    let ok = 0, bajo = 0, critico = 0;
    for (const r of dedup) {
      const stock = getStockUnits(r, mS?.stock_qty);
      if (stock <= 0) continue;
      const name = getProductName(r, mS?.name);
      const avg = avgByProduct.get(name.trim().toLowerCase()) || 0;

      if (avg > 0) {
        const coverage = (stock / avg) * 30;
        if (coverage < LEAD * 0.5) critico++;
        else if (coverage < LEAD * 2) bajo++;
        else ok++;
      } else {
        // No sales data: fall back to min_stock
        const min = findNumber(r, FIELD_STOCK_MIN, mS?.stock_min);
        if (min > 0 && stock < min) critico++;
        else ok++;
      }
    }
    return { ok, bajo, critico };
  })();

  // Build available periods for Topbar dropdown (mismo set que PeriodPills usaba)
  const formatPeriodLabel = (val: string): string => {
    if (val === 'all') return 'Todo el período';
    if (/^\d{4}$/.test(val)) return val;
    if (/^\d{4}-\d{2}$/.test(val)) {
      const [y, m] = val.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
        .replace('.', '')
        .replace(/^\w/, c => c.toUpperCase());
    }
    return val;
  };
  const years = [...new Set(availableMonths.map(m => m.split('-')[0]))].sort().reverse().slice(0, 3);
  const recentMonths = [...availableMonths].sort().reverse().slice(0, 3);
  const periodOptions = ['all', ...years, ...recentMonths].map(v => ({ value: v, label: formatPeriodLabel(v) }));
  const currentPeriodLabel = formatPeriodLabel(period);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <Topbar
        userName={name}
        pageTitle="Dashboard"
        breadcrumb={company}
        currentPeriod={period}
        onPeriodChange={setPeriod}
        availablePeriods={periodOptions}
      />

      {/* Banners */}
      <Stagger index={1}>
        <div className="space-y-2">
          {!dataLoading && (
            hasData ? (
              <div
                className="rounded-2xl px-5 py-3 text-xs flex items-center gap-3 flex-wrap"
                style={{
                  background: 'hsl(var(--pastel-mint) / 0.3)',
                  color: 'hsl(155 45% 25%)',
                  border: '1px solid hsl(var(--pastel-mint) / 0.5)',
                }}
              >
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 min-w-[160px]">Mostrando datos reales extraídos de tus archivos cargados</span>
                {/* 5.13 Per-category freshness pills — clickable for lineage (5.14) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['ventas', 'gastos', 'stock', 'marketing'] as CategoryKey[])
                    .filter(c => lastUploadDates[c])
                    .map(c => (
                      <span key={c} className="inline-flex items-center gap-1">
                        <span className="text-[10px] text-foreground/60">{CATEGORY_LABELS[c]}</span>
                        <FreshnessPill
                          lastUpload={lastUploadDates[c]}
                          onClick={() => navigate(`/carga-datos?category=${c}`)}
                          compact
                        />
                      </span>
                    ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl px-4 py-2.5 text-xs flex items-center gap-2 bg-card text-muted-foreground border border-border">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span>Sin datos cargados. <Link to="/carga-datos" className="underline font-medium">Cargá tus archivos</Link> para ver tus métricas.</span>
              </div>
            )
          )}

          {duplicatedPeriods.length > 0 && !duplicateBannerDismissed && (
            <div className="rounded-2xl px-4 py-3 text-xs flex items-start gap-3 alert-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1">
                Datos posiblemente duplicados: los meses {duplicatedPeriods.map(p => {
                  const [y, m] = p.split('-');
                  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
                  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                }).join(', ')} aparecen en más de un archivo. <Link to="/carga-datos" className="underline font-medium">Revisá tus archivos</Link>.
              </span>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setDuplicateBannerDismissed(true)}
                className="shrink-0 text-foreground/70 hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
          )}
          {(hasCurrencyMix.ventas || hasCurrencyMix.gastos) && (
            <div className="rounded-2xl px-4 py-2.5 text-xs flex items-start gap-2 alert-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Múltiples monedas detectadas en {[hasCurrencyMix.ventas && 'ventas', hasCurrencyMix.gastos && 'gastos'].filter(Boolean).join(' y ')}
                {(detectedCurrencies.ventas.length > 1 || detectedCurrencies.gastos.length > 1) && (
                  <> ({Array.from(new Set([...detectedCurrencies.ventas, ...detectedCurrencies.gastos])).join(' + ')})</>
                )}
                . Convertí todo a la misma moneda antes de cargar para ver totales precisos.
              </span>
            </div>
          )}
          {realOtro.length > 0 && (
            <div className="rounded-2xl px-4 py-2.5 text-xs flex items-center gap-2 alert-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Hay <strong>{realOtro.length}</strong> filas sin clasificar. <Link to="/carga-datos" className="underline font-medium">Revisá en Carga de datos</Link>.</span>
            </div>
          )}
        </div>
      </Stagger>

      {/* Empty state */}
      {!hasData && !dataLoading && (
        <Stagger index={2}>
          <Card className="border-dashed rounded-3xl">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <Upload className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-semibold">Cargá tus primeros archivos</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Subí tus Excel de ventas, PDFs de facturas o CSVs de stock. La plataforma los procesa con IA automáticamente.
                </p>
              </div>
              <Link to="/carga-datos">
                <Button className="rounded-full gap-2">
                  <Upload className="h-4 w-4" />
                  Ir a Carga de datos
                </Button>
              </Link>
            </CardContent>
          </Card>
        </Stagger>
      )}

      {/* Grid 4×2 */}
      {hasData && (
        <Stagger index={2}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Row 1 */}
            <div className="md:col-span-2 lg:col-span-2">
              <ResumenEjecutivoCard highlights={highlights} />
            </div>
            <VentasMesCard total={salesTotal} data={salesChartData} periodLabel={currentPeriodLabel} />
            <GananciaCard ganancia={ganancia} margenPct={margenPct} ingresos={salesTotal} costos={gastosTotal} />

            {/* Row 2 */}
            <FlujoCajaCard ingresos={salesTotal} egresos={gastosTotal} />
            <div className="md:col-span-2 lg:col-span-2">
              <ForecastCard data={forecastData} />
            </div>
            {showStock ? (
              <StockCard ok={stockBreakdown.ok} bajo={stockBreakdown.bajo} critico={stockBreakdown.critico} />
            ) : showAds ? (
              <InversionPublicitariaCard
                metaSpend={marketingSpend ?? 0}
                metaBudget={(marketingSpend ?? 0) * 1.2}
                googleSpend={0}
                googleBudget={0}
              />
            ) : null}

            {/* Row 3 — ads if both stock and ads visible */}
            {showStock && showAds && (
              <div className="md:col-span-2 lg:col-span-4">
                <InversionPublicitariaCard
                  metaSpend={marketingSpend ?? 0}
                  metaBudget={(marketingSpend ?? 0) * 1.2}
                  googleSpend={0}
                  googleBudget={0}
                />
              </div>
            )}
          </div>
        </Stagger>
      )}
    </div>
  );
}
