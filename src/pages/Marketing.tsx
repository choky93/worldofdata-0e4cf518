import { useState, useMemo } from 'react';
import { usePeriod } from '@/contexts/PeriodContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, formatNumber, safeDiv } from '@/lib/formatters';
import { formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { useExtractedData } from '@/hooks/useExtractedData';
import { findNumber, findString, findField, findDateRaw, FIELD_CAMPAIGN_NAME, FIELD_SPEND, FIELD_REVENUE, FIELD_ROAS, FIELD_CLICKS, FIELD_CTR, FIELD_CONVERSIONS, FIELD_REACH, FIELD_IMPRESSIONS, FIELD_DATE, FIELD_START_DATE, FIELD_END_DATE, FIELD_OBJECTIVE } from '@/lib/field-utils';
import { filterByPeriod, parseDate, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, Upload, Database, Loader2, Megaphone, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { HelpTooltip } from '@/components/HelpTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getObjectiveOverride, setObjectiveOverride, subscribeMarketingOverrides, OBJECTIVE_OPTIONS } from '@/lib/marketing-overrides';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface CampaignRow {
  name: string;
  objective: string;
  spend: number;
  revenue: number;
  roas: number;
  clicks: number;
  ctr: number;
  conversions: number;
  reach: number;
  impressions: number;
  date: string;
  startDate: string;
  endDate: string;
}

/** Check if a field (by keywords or mapping) exists in at least one row */
function fieldExists(rows: any[], keywords: string[], mappedCol?: string | null): boolean {
  return rows.some(r => {
    if (mappedCol && r[mappedCol] !== undefined && r[mappedCol] !== null && String(r[mappedCol]).trim() !== '') return true;
    return findField(r, keywords) !== null && findField(r, keywords) !== undefined;
  });
}

function formatDateShort(raw: string): string {
  if (!raw) return '—';
  const d = parseDate(raw);
  if (!d) return raw;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Normaliza el objetivo de una campaña.
 * 1) Si la celda contiene basura (presupuesto "diario", "vitalicio", "manual", etc.) la descartamos.
 * 2) Buscamos keywords de objetivo en el valor crudo.
 * 3) Si no hay match, intentamos inferir desde el NOMBRE de la campaña.
 */
const NON_OBJECTIVE_VALUES = [
  'diario', 'daily', 'vitalicio', 'lifetime', 'manual', 'automatico', 'automatic', 'auto',
  'cbo', 'abo', 'budget', 'presupuesto', 'low', 'medio', 'medium', 'high', 'desconocido',
];

function classifyObjective(text: string | null | undefined): string {
  if (!text) return '';
  const raw = String(text).toLowerCase();
  // Sacar tildes sin tocar símbolos
  const n = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('whatsapp') || n.includes('wsp') || n.includes('mensaj') || n.includes('message') || n.includes('chat')) return 'Mensajes';
  if (n.includes('conversion') || n.includes('purchase') || n.includes('compra') || n.includes('venta') || n.includes('checkout')) return 'Conversiones';
  if (n.includes('traffic') || n.includes('trafico') || n.includes('click') || n.includes('link') || n.includes(' web') || n.includes('sitio')) return 'Tráfico';
  if (n.includes('lead') || n.includes('prospecto') || n.includes('formulario') || n.includes('registro') || n.includes('signup')) return 'Leads';
  if (n.includes('awareness') || n.includes('conciencia') || n.includes('reconoc') || n.includes('alcance') || n.includes('reach') || n.includes('brand')) return 'Alcance/Branding';
  if (n.includes('engagement') || n.includes('interaccion') || n.includes('like') || n.includes('seguidor') || n.includes('follower')) return 'Interacción';
  if (n.includes('video') || n.includes('view') || n.includes('reproducci')) return 'Reproducciones';
  if (n.includes('catalog') || n.includes('shopping') || n.includes('producto')) return 'Catálogo';
  return '';
}

function normalizeObjective(raw: string, campaignName?: string): string {
  const lowered = (raw || '').toLowerCase().trim();
  const isJunk = !lowered || NON_OBJECTIVE_VALUES.some(j => lowered === j || lowered.startsWith(j + ' '));

  if (!isJunk) {
    const fromCell = classifyObjective(raw);
    if (fromCell) return fromCell;
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Si la celda es basura, intentamos inferir desde el nombre de la campaña
  const fromName = classifyObjective(campaignName);
  if (fromName) return fromName;
  return '';
}

/** @deprecated kept for compatibility, replaced by classifyObjective + normalizeObjective above */
function _legacyNormalizeObjective(raw: string): string {
  if (!raw) return '';
  const n = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  if (n.includes('conversion') || n.includes('purchase') || n.includes('compra') || n.includes('venta')) return 'Conversiones';
  if (n.includes('awareness') || n.includes('conciencia') || n.includes('alcance') || n.includes('reach') || n.includes('brand')) return 'Alcance/Branding';
  if (n.includes('traffic') || n.includes('trafico') || n.includes('click') || n.includes('link')) return 'Tráfico';
  if (n.includes('lead') || n.includes('prospecto') || n.includes('form') || n.includes('registro')) return 'Leads';
  if (n.includes('engagement') || n.includes('interaccion') || n.includes('video')) return 'Engagement';
  if (n.includes('catalog') || n.includes('catalogo') || n.includes('shopping') || n.includes('producto')) return 'Catálogo';
  // Return raw if no match, capitalize first letter
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function normalizeMarketing(rows: any[], m?: any): CampaignRow[] {
  return rows.map((r: any) => {
    const spend = findNumber(r, FIELD_SPEND, m?.spend);
    const revenue = findNumber(r, FIELD_REVENUE, m?.revenue);
    const roas = spend > 0 ? (revenue > 0 ? safeDiv(revenue, spend) : findNumber(r, FIELD_ROAS, m?.roas)) : findNumber(r, FIELD_ROAS, m?.roas);
    const rawDate = findDateRaw(r, m?.date);
    const d = parseDate(rawDate);
    const rawObjective = findString(r, FIELD_OBJECTIVE, m?.objective);
    const campaignName = findString(r, FIELD_CAMPAIGN_NAME, m?.campaign_name) || (d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin nombre');
    // Ola 22: override manual del objetivo gana sobre detección automática.
    const override = getObjectiveOverride(campaignName);
    const detected = normalizeObjective(rawObjective, campaignName);
    return {
      name: campaignName,
      objective: override || detected,
      spend,
      revenue,
      roas: parseFloat(roas.toFixed(2)),
      clicks: Math.round(findNumber(r, FIELD_CLICKS, m?.clicks)),
      ctr: findNumber(r, FIELD_CTR, m?.ctr),
      conversions: Math.round(findNumber(r, FIELD_CONVERSIONS, m?.conversions)),
      reach: Math.round(findNumber(r, FIELD_REACH, m?.reach)),
      impressions: Math.round(findNumber(r, FIELD_IMPRESSIONS, m?.impressions)),
      date: rawDate,
      startDate: findString(r, FIELD_START_DATE, m?.start_date),
      endDate: findString(r, FIELD_END_DATE, m?.end_date),
    };
  });
}

export default function Marketing() {
  const { data: extractedData, mappings, hasData, loading, availableMonths } = useExtractedData();
  const m = mappings.marketing;
  const { period, setPeriod } = usePeriod();
  const [showInactive, setShowInactive] = useState(false);

  // Ola 22: re-render cuando cambian overrides manuales de objetivo
  const [overridesTick, setOverridesTick] = useState(0);
  useEffect(() => subscribeMarketingOverrides(() => setOverridesTick(t => t + 1)), []);

  type CampaignSortKey = 'name' | 'objective' | 'spend' | 'revenue' | 'roas' | 'conversions' | 'reach' | 'impressions' | 'clicks';
  type SortDir = 'asc' | 'desc';
  const [sortConfig, setSortConfig] = useState<{ key: CampaignSortKey; dir: SortDir } | null>(null);
  const toggleSort = (key: CampaignSortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };
  const SortIcon = ({ col }: { col: CampaignSortKey }) => {
    if (!sortConfig || sortConfig.key !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortConfig.dir === 'asc' ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  const allMarketing = extractedData?.marketing || [];
  const filteredMarketing = period === 'all' ? allMarketing : filterByPeriod(allMarketing, FIELD_DATE, period, (row) => findDateRaw(row, m?.date));
  const useReal = hasData && allMarketing.length > 0;

  // ── Cálculos derivados (movidos arriba para respetar reglas de Hooks) ───
  // FIX hotfix: el useMemo de displayedCampaigns estaba después de los
  // early returns por loading/useReal. Eso violaba las reglas de Hooks
  // (cantidad de hooks distinta entre renders) y rompía Marketing en
  // pantalla blanca cuando pasaba de loading→loaded. Movemos TODO arriba.

  // overridesTick fuerza re-cómputo cuando el usuario cambia un objetivo manual
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const campaigns = useMemo(() => normalizeMarketing(filteredMarketing, m), [filteredMarketing, m, overridesTick]);

  // Excluir filas de resumen/totales del CSV para evitar doble conteo
  // AUDIT FIX (Lucas $18.000 bug): la lista anterior solo matcheaba exacto
  // → "Total de la cuenta", "Resultados totales", "Total general" se colaban
  // como campañas reales y inflaban totalSpend. Ahora chequeamos prefijos +
  // contains para cubrir todas las variantes que exporta Meta/Google Ads.
  const SUMMARY_PREFIXES = ['total', 'totales', 'resumen', 'resultados', 'subtotal'];
  const SUMMARY_CONTAINS = ['total general', 'total de la cuenta', 'total cuenta', 'all campaigns'];
  const isSummaryRow = (c: CampaignRow) => {
    if (!c.name || typeof c.name !== 'string') return true;
    const n = c.name.trim().toLowerCase();
    if (n === '' || n === 'nan' || n === 'sin nombre' || n === '---' || n === '—') return true;
    if (SUMMARY_PREFIXES.some(p => n === p || n.startsWith(p + ' ') || n.startsWith(p + ':'))) return true;
    if (SUMMARY_CONTAINS.some(k => n.includes(k))) return true;
    return false;
  };

  const realCampaigns = useMemo(() => campaigns.filter(c => !isSummaryRow(c)), [campaigns]);

  // MEJORA 1: separar campañas inactivas (sin gasto, conversiones ni impresiones)
  const isInactive = (c: CampaignRow) => c.spend === 0 && c.conversions === 0 && c.impressions === 0;
  const activeCampaigns = useMemo(() => realCampaigns.filter(c => !isInactive(c)), [realCampaigns]);
  const inactiveCount = realCampaigns.length - activeCampaigns.length;
  const baseCampaigns = showInactive ? realCampaigns : activeCampaigns;
  const displayedCampaigns = useMemo(() => {
    if (!sortConfig) return baseCampaigns;
    const { key, dir } = sortConfig;
    return [...baseCampaigns].sort((a, b) => {
      let cmp = 0;
      if (key === 'name' || key === 'objective') {
        cmp = (a[key] || '').localeCompare(b[key] || '', 'es', { sensitivity: 'base' });
      } else {
        cmp = (a[key] as number) - (b[key] as number);
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [baseCampaigns, sortConfig]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Marketing — Inversión Publicitaria</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  if (!useReal) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold">Marketing — Inversión Publicitaria</h1>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium">Sin datos de marketing</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                Cargá reportes de tus campañas de Meta Ads, Google Ads u otras plataformas para ver ROAS, clicks, conversiones y más.
              </p>
            </div>
            <Link to="/carga-datos">
              <Button className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Cargar reportes de campañas
              </Button>
            </Link>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  const totalSpend = realCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = realCampaigns.reduce((s, c) => s + c.revenue, 0);
  const globalRoas = safeDiv(totalRevenue, totalSpend);
  const totalClicks = realCampaigns.reduce((s, c) => s + c.clicks, 0);

  // FIX feedback Lucas (2026-05-03): Meta exporta una columna "Resultados"
  // que significa COSAS DISTINTAS según el objetivo:
  //   - Tráfico → clicks
  //   - Interacciones → engagements (likes, comments, shares)
  //   - Mensajes → mensajes iniciados
  //   - Conversiones/Ventas → compras reales
  // Si sumamos todo como "conversiones", el KPI miente: una campaña de
  // Interacciones con $2 de gasto reportaba 99.436 "conversiones" (eran
  // engagements). Lucas: "no son números reales, no está ni cerca".
  // Filtramos: solo contamos conversiones de campañas cuyo objetivo SÍ
  // representa una conversión real (Conversiones, Catálogo, Leads).
  const isRealConversionObjective = (obj: string): boolean => {
    if (!obj) return false;
    const n = obj.toLowerCase();
    return n.includes('conversi') || n.includes('venta') || n.includes('compra')
      || n.includes('catalog') || n.includes('lead') || n.includes('purchase');
  };
  const conversionCampaigns = realCampaigns.filter(c => isRealConversionObjective(c.objective));
  const totalConversions = conversionCampaigns.reduce((s, c) => s + c.conversions, 0);
  const conversionsAreFiltered = realCampaigns.length > conversionCampaigns.length;

  const totalReach = realCampaigns.reduce((s, c) => s + c.reach, 0);
  const totalImpressions = realCampaigns.reduce((s, c) => s + c.impressions, 0);

  // Detect which optional fields actually exist in the data
  const hasConversionsField = fieldExists(filteredMarketing, FIELD_CONVERSIONS, m?.conversions);
  const hasReachField = fieldExists(filteredMarketing, FIELD_REACH, m?.reach);
  const hasImpressionsField = fieldExists(filteredMarketing, FIELD_IMPRESSIONS, m?.impressions);
  const hasStartDateField = fieldExists(filteredMarketing, FIELD_START_DATE, m?.start_date);
  const hasEndDateField = fieldExists(filteredMarketing, FIELD_END_DATE, m?.end_date);
  const hasDateRange = hasStartDateField || hasEndDateField;
  // Ola 22: SIEMPRE mostramos la columna de objetivo si hay campañas con
  // nombre real (no fechas). Antes la ocultábamos cuando ninguna tenía
  // objetivo, lo que impedía al usuario asignarlos manualmente.
  const hasObjectiveField = realCampaigns.length > 0;

  // Check if we have campaign names or just date-based rows
  const hasCampaignNames = realCampaigns.some(c => {
    const n = c.name;
    return n && n !== 'Sin nombre' && !parseDate(n);
  });

  const chartData = realCampaigns.map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + '…' : c.name,
    gasto: c.spend,
    ingresos: c.revenue,
  }));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Marketing — Inversión Publicitaria</h1>
          <div className="flex items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} availableMonths={availableMonths} />
            <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
              <Database className="h-3.5 w-3.5" />
              Datos reales ({realCampaigns.length} {hasCampaignNames ? 'campañas' : 'registros'})
            </div>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Gasto total
              <HelpTooltip content="Cuánto invertiste en publicidad en el período seleccionado, sumando todas las campañas activas e inactivas." />
            </p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalSpend)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              ROAS global
              <HelpTooltip content={<><strong>Return On Ad Spend</strong>. Cuántos pesos de venta generaste por cada peso invertido en ads. ROAS 3x = vendiste $3 por cada $1 gastado.</>} />
            </p>
            <p className={`text-3xl font-bold ${globalRoas > 0 ? 'text-success' : ''}`}>
              {globalRoas > 0 ? `${globalRoas.toFixed(1)}x` : '—'}
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Conversiones
              <HelpTooltip content={<>
                Solo contamos conversiones <strong>reales</strong> (compras, leads, ventas) —
                excluimos engagements y mensajes porque Meta los reporta en la
                misma columna "Resultados" pero NO son conversiones.
                {conversionsAreFiltered && (
                  <><br /><strong className="text-warning">
                    Excluyendo {realCampaigns.length - conversionCampaigns.length} campaña(s) de
                    tráfico/interacción/mensajes.
                  </strong></>
                )}
              </>} />
            </p>
            <p className="text-3xl font-bold tabular-nums">{hasConversionsField ? formatNumber(totalConversions) : '—'}</p>
            {conversionsAreFiltered && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                de {conversionCampaigns.length} campaña{conversionCampaigns.length === 1 ? '' : 's'} de conversión
              </p>
            )}
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Alcance
              <HelpTooltip content="Personas únicas que vieron tus anuncios al menos una vez. Distinto de impresiones (mismas personas pueden ver varias veces)." />
            </p>
            <p className="text-3xl font-bold tabular-nums">{hasReachField ? formatNumber(totalReach) : '—'}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              Impresiones
              <HelpTooltip content="Cantidad total de veces que se mostraron tus anuncios. Si la misma persona los ve 3 veces, son 3 impresiones (1 sola persona alcanzada)." />
            </p>
             <p className="text-3xl font-bold tabular-nums">{hasImpressionsField ? formatNumber(totalImpressions) : '—'}</p>
          </CardContent></Card>
        </div>

        {chartData.length > 0 && totalRevenue > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Gasto vs Ingresos por campaña</CardTitle></CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                     <XAxis dataKey="name" tick={AXIS_STYLE.tick} />
                     <YAxis tick={AXIS_STYLE.tick} tickFormatter={formatAmount} />
                     <RTooltip formatter={(v: number) => formatCurrency(v)} {...TOOLTIP_STYLE} />
                     <Legend />
                     <Bar dataKey="gasto" name="Gasto" fill="hsl(var(--pastel-peach-strong))" opacity={0.85} radius={[4, 4, 0, 0]} />
                     <Bar dataKey="ingresos" name="Ingresos" fill="hsl(var(--pastel-mint-strong))" opacity={0.9} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">
            {hasCampaignNames ? 'Desglose por campaña' : 'Registros de inversión'}
          </CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead
                  className="min-w-[220px] cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort('name')}
                >
                  {hasCampaignNames ? 'Campaña' : 'Período'} <SortIcon col="name" />
                </TableHead>
                {hasObjectiveField && (
                  <TableHead className="cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('objective')}>
                    Objetivo <SortIcon col="objective" />
                  </TableHead>
                )}
                {hasDateRange && <TableHead>Desde</TableHead>}
                {hasDateRange && <TableHead>Hasta</TableHead>}
                <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('spend')}>
                  Gasto <SortIcon col="spend" />
                </TableHead>
                {totalRevenue > 0 && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('revenue')}>
                    Ingresos <SortIcon col="revenue" />
                  </TableHead>
                )}
                {globalRoas > 0 && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('roas')}>
                    ROAS <SortIcon col="roas" />
                  </TableHead>
                )}
                {hasConversionsField && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('conversions')}>
                    Conversiones <SortIcon col="conversions" />
                  </TableHead>
                )}
                {hasReachField && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('reach')}>
                    Alcance <SortIcon col="reach" />
                  </TableHead>
                )}
                {hasImpressionsField && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('impressions')}>
                    Impresiones <SortIcon col="impressions" />
                  </TableHead>
                )}
                {totalClicks > 0 && (
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('clicks')}>
                    Clicks <SortIcon col="clicks" />
                  </TableHead>
                )}
              </TableRow></TableHeader>
              <TableBody>
                {displayedCampaigns.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium min-w-[220px] max-w-[360px] whitespace-normal break-words">{c.name}</TableCell>
                    {hasObjectiveField && (
                      <TableCell>
                        {/* Ola 22: editor inline del objetivo. Permite override
                            manual cuando la IA no detectó (Lucas pidió poder
                            agregarlo a campañas con nombres genéricos). */}
                        <Select
                          value={c.objective || '__none__'}
                          onValueChange={(v) => {
                            try {
                              setObjectiveOverride(c.name, v === '__none__' ? null : v);
                              if (v === '__none__') {
                                toast.success(`Override de objetivo eliminado para "${c.name}"`);
                              } else {
                                toast.success(`Objetivo de "${c.name}" → ${v}`);
                              }
                            } catch (err) {
                              const e = err as { message?: string };
                              toast.error('No se pudo guardar', { description: e.message });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[10px] min-w-[130px]">
                            <SelectValue placeholder="— Sin objetivo —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-xs italic text-muted-foreground">
                              — Sin asignar —
                            </SelectItem>
                            {OBJECTIVE_OPTIONS.map(o => (
                              <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {hasDateRange && <TableCell className="tabular-nums text-muted-foreground">{formatDateShort(c.startDate)}</TableCell>}
                    {hasDateRange && <TableCell className="tabular-nums text-muted-foreground">{formatDateShort(c.endDate)}</TableCell>}
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                    {totalRevenue > 0 && <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>}
                    {globalRoas > 0 && <TableCell className="text-right font-bold tabular-nums">{c.roas > 0 ? `${c.roas}x` : '—'}</TableCell>}
                    {hasConversionsField && (
                      <TableCell className="text-right tabular-nums">
                        {c.conversions > 0 ? (
                          isRealConversionObjective(c.objective) ? (
                            <span>{formatNumber(c.conversions)}</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground/60 cursor-help underline decoration-dotted">
                                  {formatNumber(c.conversions)}*
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">
                                  Esta campaña es de "{c.objective}" — los "Resultados" reportados son engagements/clicks/mensajes, NO conversiones reales. Por eso no entran en el total de Conversiones.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )
                        ) : '0'}
                      </TableCell>
                    )}
                    {hasReachField && <TableCell className="text-right tabular-nums">{c.reach > 0 ? formatNumber(c.reach) : '0'}</TableCell>}
                    {hasImpressionsField && <TableCell className="text-right tabular-nums">{c.impressions > 0 ? formatNumber(c.impressions) : '0'}</TableCell>}
                    {totalClicks > 0 && <TableCell className="text-right tabular-nums">{c.clicks > 0 ? formatNumber(c.clicks) : '—'}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {inactiveCount > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                <span>{inactiveCount} campaña{inactiveCount === 1 ? '' : 's'} sin actividad {showInactive ? 'incluida' + (inactiveCount === 1 ? '' : 's') : 'oculta' + (inactiveCount === 1 ? '' : 's')}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowInactive(v => !v)}>
                  {showInactive ? 'Ocultar inactivas' : 'Mostrar todas'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
