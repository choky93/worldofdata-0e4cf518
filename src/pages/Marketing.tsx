import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, formatNumber, safeDiv } from '@/lib/formatters';
import { formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';
import { useExtractedData } from '@/hooks/useExtractedData';
import { findNumber, findString, FIELD_CAMPAIGN_NAME, FIELD_SPEND, FIELD_REVENUE, FIELD_ROAS, FIELD_CLICKS, FIELD_CTR, FIELD_CONVERSIONS, FIELD_REACH, FIELD_IMPRESSIONS, FIELD_DATE } from '@/lib/field-utils';
import { filterByPeriod, parseDate, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodPills } from '@/components/ui/PeriodPills';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, Upload, Database, Loader2, Megaphone } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface CampaignRow {
  name: string;
  spend: number;
  revenue: number;
  roas: number;
  clicks: number;
  ctr: number;
  conversions: number;
  reach: number;
  impressions: number;
  date: string;
}

function normalizeMarketing(rows: any[], m?: any): CampaignRow[] {
  return rows.map((r: any) => {
    const spend = findNumber(r, FIELD_SPEND, m?.spend);
    const revenue = findNumber(r, FIELD_REVENUE, m?.revenue);
    const roas = spend > 0 ? (revenue > 0 ? safeDiv(revenue, spend) : findNumber(r, FIELD_ROAS, m?.roas)) : findNumber(r, FIELD_ROAS, m?.roas);
    const rawDate = findString(r, FIELD_DATE, m?.date);
    const d = parseDate(rawDate);
    return {
      name: findString(r, FIELD_CAMPAIGN_NAME, m?.campaign_name) || (d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin nombre'),
      spend,
      revenue,
      roas: parseFloat(roas.toFixed(2)),
      clicks: Math.round(findNumber(r, FIELD_CLICKS, m?.clicks)),
      ctr: findNumber(r, FIELD_CTR, m?.ctr),
      conversions: Math.round(findNumber(r, FIELD_CONVERSIONS, m?.conversions)),
      reach: Math.round(findNumber(r, FIELD_REACH, m?.reach)),
      impressions: Math.round(findNumber(r, FIELD_IMPRESSIONS, m?.impressions)),
      date: rawDate,
    };
  });
}

export default function Marketing() {
  const { data: extractedData, mappings, hasData, loading, availableMonths } = useExtractedData();
  const m = mappings.marketing;
  const [period, setPeriod] = useState<PeriodKey>('all');
  const allMarketing = extractedData?.marketing || [];
  const filteredMarketing = period === 'all' ? allMarketing : filterByPeriod(allMarketing, FIELD_DATE, period, (row, kw) => findString(row, kw, m?.date));
  const useReal = hasData && allMarketing.length > 0;

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

  const campaigns = normalizeMarketing(filteredMarketing, m);

  // Excluir filas de resumen/totales del CSV para evitar doble conteo
  const SUMMARY_NAMES = ['total', 'resumen', 'subtotal', 'nan'];
  const isSummaryRow = (c: CampaignRow) =>
    !c.name ||
    typeof c.name !== 'string' ||
    c.name.trim() === '' ||
    c.name === 'Sin nombre' ||
    SUMMARY_NAMES.includes(c.name.toLowerCase().trim());

  const realCampaigns = campaigns.filter(c => !isSummaryRow(c));

  const totalSpend = realCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = realCampaigns.reduce((s, c) => s + c.revenue, 0);
  const globalRoas = safeDiv(totalRevenue, totalSpend);
  const totalClicks = realCampaigns.reduce((s, c) => s + c.clicks, 0);
  const totalConversions = realCampaigns.reduce((s, c) => s + c.conversions, 0);
  const totalReach = realCampaigns.reduce((s, c) => s + c.reach, 0);
  const totalImpressions = realCampaigns.reduce((s, c) => s + c.impressions, 0);

  // Check if we have campaign names or just date-based rows
  const hasCampaignNames = campaigns.some(c => {
    const n = c.name;
    // Check if name looks like a date (our fallback) vs a real campaign name
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
            <PeriodPills value={period} onChange={setPeriod} availableMonths={availableMonths} />
            <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
              <Database className="h-3.5 w-3.5" />
              Datos reales ({realCampaigns.length} {hasCampaignNames ? 'campañas' : 'registros'})
            </div>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Gasto total</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalSpend)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              ROAS global
              <Tooltip>
                <TooltipTrigger asChild><span className="cursor-help">ⓘ</span></TooltipTrigger>
                <TooltipContent><p className="text-xs">Return On Ad Spend = Ingresos generados / Gasto en publicidad.</p></TooltipContent>
              </Tooltip>
            </p>
            <p className={`text-3xl font-bold ${globalRoas > 0 ? 'text-success' : ''}`}>
              {globalRoas > 0 ? `${globalRoas.toFixed(1)}x` : '—'}
            </p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Conversiones</p>
            <p className="text-3xl font-bold tabular-nums">{totalConversions > 0 ? formatNumber(totalConversions) : '—'}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Alcance</p>
            <p className="text-3xl font-bold tabular-nums">{totalReach > 0 ? formatNumber(totalReach) : '—'}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Impresiones</p>
             <p className="text-3xl font-bold tabular-nums">{totalImpressions > 0 ? formatNumber(totalImpressions) : '—'}</p>
          </CardContent></Card>
        </div>

        {chartData.length > 0 && totalRevenue > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Gasto vs Ingresos por campaña</CardTitle></CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                     <XAxis dataKey="name" tick={AXIS_STYLE.tick} />
                     <YAxis tick={AXIS_STYLE.tick} tickFormatter={formatAmount} />
                     <RTooltip formatter={(v: number) => formatCurrency(v)} {...TOOLTIP_STYLE} />
                     <Legend />
                     <Bar dataKey="gasto" name="Gasto" fill="#f87171" opacity={0.7} radius={[2, 2, 0, 0]} />
                     <Bar dataKey="ingresos" name="Ingresos" fill="#c8f135" opacity={0.8} radius={[2, 2, 0, 0]} />
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
                <TableHead>{hasCampaignNames ? 'Campaña' : 'Período'}</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                {totalRevenue > 0 && <TableHead className="text-right">Ingresos</TableHead>}
                {globalRoas > 0 && <TableHead className="text-right">ROAS</TableHead>}
                {totalConversions > 0 && <TableHead className="text-right">Conversiones</TableHead>}
                {totalReach > 0 && <TableHead className="text-right">Alcance</TableHead>}
                {totalImpressions > 0 && <TableHead className="text-right">Impresiones</TableHead>}
                {totalClicks > 0 && <TableHead className="text-right">Clicks</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {campaigns.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.spend)}</TableCell>
                    {totalRevenue > 0 && <TableCell className="text-right tabular-nums">{formatCurrency(c.revenue)}</TableCell>}
                    {globalRoas > 0 && <TableCell className="text-right font-bold tabular-nums">{c.roas > 0 ? `${c.roas}x` : '—'}</TableCell>}
                    {totalConversions > 0 && <TableCell className="text-right tabular-nums">{c.conversions || '—'}</TableCell>}
                    {totalReach > 0 && <TableCell className="text-right tabular-nums">{c.reach > 0 ? formatNumber(c.reach) : '—'}</TableCell>}
                    {totalImpressions > 0 && <TableCell className="text-right tabular-nums">{c.impressions > 0 ? formatNumber(c.impressions) : '—'}</TableCell>}
                    {totalClicks > 0 && <TableCell className="text-right tabular-nums">{c.clicks > 0 ? formatNumber(c.clicks) : '—'}</TableCell>}
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
