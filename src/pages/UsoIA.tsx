/**
 * UsoIA (Ola 20).
 *
 * Panel de monitoreo de consumo de APIs de IA. Muestra:
 *   - KPIs: total gastado, tokens, llamadas, ahorro por cache
 *   - Breakdown por proveedor (OpenAI / Perplexity / Anthropic)
 *   - Breakdown por modelo
 *   - Breakdown por feature (Copilot / extracción de archivos / etc.)
 *   - Serie temporal: gasto por día
 *   - Tabla detallada de últimas llamadas
 *   - Sección educativa: qué hace cada modelo, qué cuesta cada cosa
 *   - Estimaciones por tipo de empresa (PYME / mediana / grande)
 *
 * Visible para todos los usuarios (rol mixto). Cuando se separen roles,
 * mover a admin-only.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Sparkles, DollarSign, Zap, FileText, MessageSquare, Database, Loader2, Info,
  TrendingUp, Building2, Building, ChevronDown, ChevronUp, Server,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { KPICard } from '@/components/ui/KPICard';
import { HelpTooltip } from '@/components/HelpTooltip';
import { useAIUsage, type UsageRange } from '@/hooks/useAIUsage';
import { PRICING, FEATURE_LABELS, PROVIDER_LABELS, USAGE_PROFILES } from '@/lib/ai-pricing';
import { formatAmount, TOOLTIP_STYLE, AXIS_STYLE } from '@/lib/chart-config';

const RANGE_LABELS: Record<UsageRange, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 3 meses',
  'all': 'Todo el historial',
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'hsl(var(--pastel-mint-strong))',
  anthropic: 'hsl(var(--pastel-peach-strong))',
  perplexity: 'hsl(var(--pastel-sky-strong))',
};

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return '< $0.01';
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export default function UsoIA() {
  const [range, setRange] = useState<UsageRange>('30d');
  const { logs, loading, totals, byProvider, byModel, byFeature, byDay } = useAIUsage(range);

  const cacheSavings = totals.cachedTokens > 0
    ? totals.cachedTokens / 1_000_000 * 1.25  // gpt-4o cached saving es 50% (1.25 vs 2.50)
    : 0;

  const [educationOpen, setEducationOpen] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Uso de IA</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando consumo...</span>
        </div>
      </div>
    );
  }

  const providerChartData = byProvider.map(p => ({
    name: PROVIDER_LABELS[p.provider] || p.provider,
    cost: Number(p.cost.toFixed(4)),
    fill: PROVIDER_COLORS[p.provider] || 'hsl(var(--muted))',
  }));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6" />
              Uso de IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Acá ves exactamente en qué se está gastando la inversión en inteligencia artificial.
              Cada llamada al Copilot, cada archivo procesado, cada búsqueda de mercado se registra
              con tokens consumidos y costo en USD.
            </p>
          </div>
          <Tabs value={range} onValueChange={(v) => setRange(v as UsageRange)} className="shrink-0">
            <TabsList>
              {(Object.keys(RANGE_LABELS) as UsageRange[]).map(r => (
                <TabsTrigger key={r} value={r} className="text-xs">{RANGE_LABELS[r]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <Sparkles className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Sin uso registrado en este período</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Cuando vos o tu equipo usen el Copilot o suban archivos, acá vas a ver el consumo detallado.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPIs principales */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="Gasto total"
                value={formatUsd(totals.total)}
                subtext={RANGE_LABELS[range]}
                icon={<DollarSign className="h-4 w-4" />}
                accent
                help="Costo total en USD de las llamadas a APIs de IA en el período seleccionado. Calculado al momento de cada llamada con los precios oficiales."
              />
              <KPICard
                label="Llamadas totales"
                value={totals.count.toLocaleString('es-AR')}
                subtext={`${formatTokens(totals.inputTokens + totals.outputTokens)} tokens`}
                icon={<Zap className="h-4 w-4" />}
                help="Cantidad total de consultas a IA. Cada vez que alguien le pregunta al Copilot o sube un archivo, son una o varias llamadas según el flujo."
              />
              <KPICard
                label="Tokens de entrada"
                value={formatTokens(totals.inputTokens)}
                subtext={totals.cachedTokens > 0 ? `${formatTokens(totals.cachedTokens)} cacheados` : 'sin cache'}
                icon={<Server className="h-4 w-4" />}
                help="Cuántos tokens (~3-4 caracteres por token) le mandamos a los modelos. El input es lo que le 'damos a leer'. Los cacheados pagan 50% menos."
              />
              <KPICard
                label="Ahorro por cache"
                value={formatUsd(cacheSavings)}
                subtext={cacheSavings > 0 ? 'gracias al prompt caching' : 'aún sin caché acumulado'}
                icon={<TrendingUp className="h-4 w-4" />}
                help="OpenAI cachea las partes repetidas del prompt y nos cobra 50% menos por esa porción. Esto es el ahorro estimado en el período."
              />
            </div>

            {/* Charts */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    Gasto por proveedor
                    <HelpTooltip content="Cuánto gastamos con cada proveedor de IA. OpenAI (Copilot), Anthropic (procesamiento de archivos) y Perplexity (búsquedas de mercado)." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={providerChartData}
                          dataKey="cost"
                          nameKey="name"
                          outerRadius={70}
                          label={(d) => `${d.name}: ${formatUsd(d.cost)}`}
                        >
                          {providerChartData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RTooltip formatter={(v: number) => formatUsd(v)} {...TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="text-xs space-y-1 mt-2">
                    {byProvider.map(p => (
                      <li key={p.provider} className="flex justify-between">
                        <span className="font-medium">{PROVIDER_LABELS[p.provider] || p.provider}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatUsd(p.cost)} · {p.count} llamadas
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    Gasto por feature
                    <HelpTooltip content="Cuánto cuesta cada feature de la plataforma. Útil para entender si el Copilot o el procesamiento de archivos te están costando más." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byFeature.map(f => ({ name: FEATURE_LABELS[f.feature] || f.feature, cost: Number(f.cost.toFixed(4)) }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={AXIS_STYLE.tick} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <YAxis dataKey="name" type="category" tick={AXIS_STYLE.tick} width={130} />
                        <RTooltip formatter={(v: number) => formatUsd(v)} {...TOOLTIP_STYLE} />
                        <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Serie temporal */}
            {byDay.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    Gasto día a día
                    <HelpTooltip content="Evolución del gasto diario. Picos pueden ser días donde se cargaron muchos archivos o se hicieron muchas consultas al Copilot." />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={byDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={AXIS_STYLE.tick} tickFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} />
                        <YAxis tick={AXIS_STYLE.tick} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <RTooltip formatter={(v: number) => formatUsd(v)} labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })} {...TOOLTIP_STYLE} />
                        <Line type="monotone" dataKey="cost" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabla detallada por modelo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Detalle por modelo</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Para qué se usa</TableHead>
                      <TableHead className="text-right">Llamadas</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byModel.map(m => (
                      <TableRow key={m.model}>
                        <TableCell className="font-mono text-xs">{m.model}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {PRICING[m.model]?.useCase ?? 'Uso interno'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.count.toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(m.tokens)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatUsd(m.cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Sección educativa */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setEducationOpen(o => !o)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                ¿Cómo funcionan los costos de IA? (info para entender los números)
              </CardTitle>
              {educationOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {educationOpen && (
            <CardContent className="space-y-5 text-sm">
              <div>
                <p className="font-semibold mb-2">Qué es un "token"</p>
                <p className="text-muted-foreground">
                  Es la unidad mínima que cobran los modelos de IA. <strong>1 token ≈ 3-4 caracteres en español</strong>.
                  Una palabra como "negocio" son 2 tokens. Una frase corta de 10 palabras son ~15 tokens.
                  Cobran tanto el "input" (lo que le mandás a leer) como el "output" (lo que el modelo te responde).
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">Precios actuales (USD por millón de tokens)</p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Para qué</TableHead>
                        <TableHead className="text-right">Input / 1M</TableHead>
                        <TableHead className="text-right">Cacheado / 1M</TableHead>
                        <TableHead className="text-right">Output / 1M</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(PRICING).map(([model, p]) => (
                        <TableRow key={model}>
                          <TableCell className="font-mono text-xs">{model}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.useCase}</TableCell>
                          <TableCell className="text-right tabular-nums">${p.input.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-success">{p.inputCached ? `$${p.inputCached.toFixed(2)}` : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">${p.output.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="font-semibold mb-2">Qué hace cada modelo</p>
                <div className="space-y-2 text-sm">
                  {Object.entries(PRICING).map(([model, p]) => (
                    <div key={model} className="border-l-2 border-primary/30 pl-3">
                      <p className="font-mono text-xs font-semibold">{model}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                      <p className="text-xs">{p.useCase}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-success" />
                  Optimizaciones aplicadas (Ola 19)
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 ml-2">
                  <li>✓ <strong>Prompt caching automático de OpenAI</strong>: las partes fijas del system prompt se cachean y pagamos 50% menos por las repeticiones (~40% de ahorro en Copilot).</li>
                  <li>✓ <strong>Techo de respuesta del Copilot</strong>: máximo 800 tokens por respuesta. Si el modelo se quiere ir de eso, lo cortamos. (~10% de ahorro adicional).</li>
                  <li>✓ <strong>Tracking detallado</strong>: cada llamada se loggea con costos para que puedas detectar cualquier desvío.</li>
                </ul>
                <p className="text-[11px] text-muted-foreground mt-2 italic">
                  No bajamos calidad ni capacidad — todas estas optimizaciones son "gratis" en el sentido de que no recortan funcionalidad.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Estimaciones por tipo de empresa */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Estimaciones de costo según el tamaño del cliente
              <HelpTooltip content="Una empresa más grande naturalmente consume más IA: más usuarios consultando al Copilot, más archivos procesados. Estos rangos son referenciales con uso típico." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              El costo escala con el uso real. <strong>No es razonable cobrar lo mismo a una PYME chica que a una empresa grande</strong> —
              la cantidad de datos a procesar es radicalmente distinta.
            </p>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {USAGE_PROFILES.map(profile => (
                <div key={profile.label} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <p className="font-semibold text-sm">{profile.label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{profile.description}</p>
                  <div className="text-xs space-y-0.5 pt-2 border-t">
                    <p><FileText className="h-3 w-3 inline" /> ~{profile.filesPerMonth} archivos/mes</p>
                    <p><MessageSquare className="h-3 w-3 inline" /> ~{profile.copilotQueriesPerMonth} consultas Copilot/mes</p>
                  </div>
                  <div className="rounded bg-muted/50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Costo IA estimado</p>
                    <p className="font-bold text-sm tabular-nums">
                      ${profile.estimatedMonthlyCost.min} – ${profile.estimatedMonthlyCost.max}
                    </p>
                    <p className="text-[10px] text-muted-foreground">USD/mes</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Últimas llamadas */}
        {logs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4" />
                Últimas {Math.min(50, logs.length)} llamadas
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.slice(0, 50).map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {new Date(l.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-xs">{PROVIDER_LABELS[l.provider] || l.provider}</TableCell>
                      <TableCell className="text-xs font-mono">{l.model}</TableCell>
                      <TableCell className="text-xs">{FEATURE_LABELS[l.feature] || l.feature}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatTokens(l.input_tokens)}
                        {l.input_tokens_cached ? <span className="text-success ml-1">({formatTokens(l.input_tokens_cached)} cache)</span> : null}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatTokens(l.output_tokens)}</TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">{formatUsd(Number(l.cost_usd))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
