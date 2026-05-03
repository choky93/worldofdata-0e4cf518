/**
 * Pipeline (Ola 21) — visualización de oportunidades de un CRM.
 *
 * Lee la categoría 'crm' (mapping en lib/category-modules.ts) y muestra:
 *   - KPIs: pipeline total, won, lost, win rate, avg deal size, avg cycle.
 *   - Embudo por etapa (Prospecting → Closed Won/Lost).
 *   - Tabla de deals filtrable por owner/stage.
 *   - Filtros temporales (close_date) heredando PeriodSelector global.
 *
 * Si no hay datos de CRM cargados, muestra empty state que guía a
 * subir archivos (instrucciones explícitas para Salesforce/HubSpot/Pipedrive).
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useExtractedData } from '@/hooks/useExtractedData';
import { usePeriod } from '@/contexts/PeriodContext';
import { PeriodSelector } from '@/components/PeriodSelector';
import { findNumber, findString, findDateRaw, FIELD_AMOUNT, FIELD_DATE, FIELD_DEAL_STAGE, FIELD_DEAL_NAME, FIELD_DEAL_OWNER, FIELD_PROBABILITY, FIELD_LEAD_SOURCE, FIELD_CLIENT } from '@/lib/field-utils';
import { filterByPeriod, parseDate } from '@/lib/data-cleaning';
import { formatCurrency, formatPercent, pluralES } from '@/lib/formatters';
import { KPICard } from '@/components/ui/KPICard';
import { HelpTooltip } from '@/components/HelpTooltip';
import { GitBranch, TrendingUp, Award, XCircle, Clock, Users, Database, Upload, Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';

interface Deal {
  id: string;
  name: string;
  account: string;
  stage: string;
  amount: number;
  probability: number;
  closeDate: string;
  createdDate: string;
  owner: string;
  source: string;
  isWon: boolean;
  isLost: boolean;
}

/** Detección de "won" / "lost" desde el texto del stage (multi-idioma). */
function classifyStage(stage: string): { isWon: boolean; isLost: boolean; normalized: string } {
  const n = stage.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const isWon = n.includes('won') || n.includes('ganad') || n.includes('cerrado_ganad') || n.includes('closed won');
  const isLost = n.includes('lost') || n.includes('perdid') || n.includes('cerrado_perdid') || n.includes('closed lost');
  return { isWon, isLost, normalized: stage };
}

function normalizeDeals(rows: any[], m?: any): Deal[] {
  return rows.map((r: any, i: number) => {
    const stageRaw = findString(r, FIELD_DEAL_STAGE, m?.stage) || 'Sin etapa';
    const { isWon, isLost } = classifyStage(stageRaw);
    return {
      id: r.id || String(i + 1),
      name: findString(r, FIELD_DEAL_NAME, m?.deal_name) || findString(r, FIELD_CLIENT, m?.account) || `Deal ${i + 1}`,
      account: findString(r, FIELD_CLIENT, m?.account) || '',
      stage: stageRaw,
      amount: findNumber(r, FIELD_AMOUNT, m?.amount),
      probability: findNumber(r, FIELD_PROBABILITY, m?.probability),
      closeDate: findDateRaw(r, m?.close_date) || '',
      createdDate: findString(r, ['created_date', 'create_date', 'fecha_creacion', 'createdate'], m?.created_date) || '',
      owner: findString(r, FIELD_DEAL_OWNER, m?.owner) || '',
      source: findString(r, FIELD_LEAD_SOURCE, m?.lead_source) || '',
      isWon,
      isLost,
    };
  });
}

const STAGE_ORDER_KEYWORDS = [
  ['prospect', 'lead', 'new'],
  ['qualif', 'discover'],
  ['propos', 'present'],
  ['negotiat', 'contract'],
  ['won', 'ganad'],
  ['lost', 'perdid'],
];

function stageRank(stage: string): number {
  const n = stage.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (let i = 0; i < STAGE_ORDER_KEYWORDS.length; i++) {
    if (STAGE_ORDER_KEYWORDS[i].some(k => n.includes(k))) return i;
  }
  return 99;
}

type SortKey = 'name' | 'stage' | 'amount' | 'probability' | 'closeDate' | 'owner';
type SortDir = 'asc' | 'desc';

export default function Pipeline() {
  const { data: extractedData, mappings, hasData, loading, availableMonths } = useExtractedData();
  const m = mappings.crm;
  const { period, setPeriod } = usePeriod();
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const allCrm = extractedData?.crm || [];
  const filteredCrm = period === 'all' ? allCrm : filterByPeriod(allCrm, FIELD_DATE, period, (row) => findDateRaw(row, m?.close_date));
  const useReal = hasData && allCrm.length > 0;

  const deals = useMemo(() => normalizeDeals(filteredCrm, m), [filteredCrm, m]);

  const stageStats = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; isWon: boolean; isLost: boolean }>();
    for (const d of deals) {
      const cur = map.get(d.stage) || { count: 0, amount: 0, isWon: d.isWon, isLost: d.isLost };
      cur.count += 1;
      cur.amount += d.amount;
      map.set(d.stage, cur);
    }
    return Array.from(map.entries())
      .map(([stage, v]) => ({ stage, ...v, rank: stageRank(stage) }))
      .sort((a, b) => a.rank - b.rank);
  }, [deals]);

  const totalValue = deals.reduce((s, d) => s + d.amount, 0);
  const wonDeals = deals.filter(d => d.isWon);
  const lostDeals = deals.filter(d => d.isLost);
  const openDeals = deals.filter(d => !d.isWon && !d.isLost);
  const wonValue = wonDeals.reduce((s, d) => s + d.amount, 0);
  const lostValue = lostDeals.reduce((s, d) => s + d.amount, 0);
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const closedTotal = wonDeals.length + lostDeals.length;
  const winRate = closedTotal > 0 ? (wonDeals.length / closedTotal) * 100 : 0;
  const avgDealSize = wonDeals.length > 0 ? wonValue / wonDeals.length : 0;

  // Avg cycle: días entre createdDate y closeDate para won deals
  const avgCycleDays = useMemo(() => {
    const cycles = wonDeals
      .map(d => {
        const created = parseDate(d.createdDate);
        const closed = parseDate(d.closeDate);
        if (!created || !closed) return null;
        return Math.round((closed.getTime() - created.getTime()) / 86400000);
      })
      .filter((v): v is number => v !== null && v >= 0);
    if (cycles.length === 0) return 0;
    return Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
  }, [wonDeals]);

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (!sortConfig || sortConfig.key !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortConfig.dir === 'asc' ? <ChevronUp className="inline h-3 w-3 ml-1" /> : <ChevronDown className="inline h-3 w-3 ml-1" />;
  };
  const sortedDeals = useMemo(() => {
    if (!sortConfig) return deals;
    const { key, dir } = sortConfig;
    return [...deals].sort((a, b) => {
      let cmp = 0;
      if (key === 'amount' || key === 'probability') {
        cmp = (a[key] as number) - (b[key] as number);
      } else if (key === 'closeDate') {
        const da = parseDate(a.closeDate)?.getTime() ?? 0;
        const db = parseDate(b.closeDate)?.getTime() ?? 0;
        cmp = da - db;
      } else {
        cmp = String(a[key] || '').localeCompare(String(b[key] || ''), 'es', { sensitivity: 'base' });
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [deals, sortConfig]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Pipeline (CRM)</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos del pipeline...</span>
        </div>
      </div>
    );
  }

  if (!useReal) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-7xl">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6" />
            Pipeline (CRM)
          </h1>
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-4 max-w-2xl mx-auto">
              <GitBranch className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">Sin datos de CRM cargados</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Esta sección muestra tu pipeline de oportunidades de venta: cuántos deals tenés en cada etapa,
                  el valor total proyectado, win rate, ciclo promedio de cierre y más.
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-left text-xs space-y-2 w-full">
                <p className="font-semibold">Cómo cargar tus datos del CRM:</p>
                <ul className="text-muted-foreground space-y-1 list-disc pl-5">
                  <li><strong>Salesforce</strong>: Reports → exportar a CSV las Opportunities con campos Stage, Amount, Close Date, Owner, Account.</li>
                  <li><strong>HubSpot</strong>: Sales → Deals → Export (CSV o XLSX).</li>
                  <li><strong>Pipedrive</strong>: Deals → ⋯ → Export.</li>
                  <li><strong>Zoho CRM</strong>: Setup → Data Administration → Export.</li>
                </ul>
                <p className="text-muted-foreground pt-1">
                  El sistema reconoce nombres de columnas en español e inglés (Deal Name / Stage / Amount / Close Date / Owner / Probability).
                </p>
              </div>
              <Link to="/carga-datos">
                <Button className="gap-2">
                  <Upload className="h-4 w-4" />
                  Cargar archivos del CRM
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  const funnelData = stageStats.map(s => ({
    name: s.stage,
    deals: s.count,
    value: s.amount,
    fill: s.isWon ? 'hsl(var(--success))' : s.isLost ? 'hsl(var(--destructive))' : 'hsl(var(--accent))',
  }));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6" />
            Pipeline (CRM)
          </h1>
          <div className="flex items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} availableMonths={availableMonths} />
            <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
              <Database className="h-3.5 w-3.5" />
              {deals.length} deal{deals.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Pipeline abierto"
            value={formatCurrency(openValue)}
            subtext={`${openDeals.length} deal${openDeals.length === 1 ? '' : 's'} activo${openDeals.length === 1 ? '' : 's'}`}
            icon={<TrendingUp className="h-4 w-4" />}
            help="Valor total de las oportunidades aún en proceso (no cerradas). Es la 'plata potencial' que está en juego."
          />
          <KPICard
            label="Won (cerrado ganado)"
            value={formatCurrency(wonValue)}
            subtext={`${wonDeals.length} deal${wonDeals.length === 1 ? '' : 's'} ganado${wonDeals.length === 1 ? '' : 's'}`}
            icon={<Award className="h-4 w-4" />}
            accent
            help="Suma de las oportunidades que cerraron exitosamente en el período. Esto sí es dinero confirmado."
          />
          <KPICard
            label="Win rate"
            value={closedTotal > 0 ? `${winRate.toFixed(0)}%` : '—'}
            subtext={closedTotal > 0 ? `${wonDeals.length}/${closedTotal} cerrados` : 'Sin deals cerrados aún'}
            icon={<Award className="h-4 w-4" />}
            help="Porcentaje de deals cerrados que se ganaron (won / (won + lost)). Estándar de la industria: 20-30% para B2B."
          />
          <KPICard
            label="Ciclo promedio"
            value={avgCycleDays > 0 ? pluralES(avgCycleDays, 'día', 'días') : '—'}
            subtext="Desde creación hasta cierre"
            icon={<Clock className="h-4 w-4" />}
            help="Cuántos días en promedio toma cerrar un deal exitoso (desde que se creó hasta que se ganó). Útil para forecast."
          />
        </div>

        {/* Embudo / Funnel */}
        {funnelData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                Embudo de ventas — deals por etapa
                <HelpTooltip content="Cuántos deals hay en cada etapa del pipeline. Etapas finales en verde (won) o rojo (lost). El ancho indica cantidad o valor según el campo." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={AXIS_STYLE.tick} tickFormatter={formatAmount} />
                    <YAxis dataKey="name" type="category" tick={AXIS_STYLE.tick} width={150} />
                    <RTooltip
                      formatter={(v: number, n: string) => n === 'deals' ? `${v} deals` : formatCurrency(v)}
                      {...TOOLTIP_STYLE}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                {stageStats.map(s => (
                  <div key={s.stage} className="border rounded p-2 text-center">
                    <p className="text-[10px] uppercase text-muted-foreground truncate">{s.stage}</p>
                    <p className="font-bold tabular-nums">{s.count}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(s.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabla de deals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Deals — {deals.length} oportunidades</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('name')}>
                    Deal <SortIcon col="name" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('stage')}>
                    Etapa <SortIcon col="stage" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('amount')}>
                    Valor <SortIcon col="amount" />
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('probability')}>
                    Probabilidad <SortIcon col="probability" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('closeDate')}>
                    Cierre estim. <SortIcon col="closeDate" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('owner')}>
                    Owner <SortIcon col="owner" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeals.slice(0, 200).map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium max-w-[260px] truncate">
                      <div className="truncate">{d.name}</div>
                      {d.account && d.account !== d.name && <div className="text-[10px] text-muted-foreground truncate">{d.account}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                        d.isWon ? 'bg-success/15 text-success' :
                        d.isLost ? 'bg-destructive/15 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {d.stage}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.amount > 0 ? formatCurrency(d.amount) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {d.probability > 0 ? `${Math.round(d.probability)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.closeDate || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.owner || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sortedDeals.length > 200 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Mostrando primeros 200 de {sortedDeals.length} deals.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
