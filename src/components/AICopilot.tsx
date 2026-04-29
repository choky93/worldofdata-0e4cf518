import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Loader2, AlertCircle, Globe, MessageSquare, ExternalLink, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { usePeriod } from '@/contexts/PeriodContext';
import { useExtractedData } from '@/hooks/useExtractedData';
import { findNumber, findDateRaw, FIELD_AMOUNT, FIELD_SPEND, FIELD_DATE } from '@/lib/field-utils';
import { filterByPeriod } from '@/lib/data-cleaning';
import { formatCurrency } from '@/lib/formatters';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = { role: 'user' | 'assistant'; content: string; citations?: string[] };
type StoredMessage = { role: string; content: string; citations?: string[] };
type Mode = 'chat' | 'search';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

function buildChipGroups(hasVentas: boolean, hasGastos: boolean, hasMarketing: boolean, hasStock: boolean, hasClientes: boolean) {
  const groups = [];

  if (hasVentas) {
    groups.push({
      label: 'Análisis de ventas',
      chips: [
        '¿Cómo vienen las ventas este período?',
        '¿Cuál fue mi mejor mes y por qué?',
        '¿Qué producto o servicio me deja más margen?',
      ],
    });
    groups.push({
      label: 'Proyecciones',
      chips: [
        '¿Cómo viene el mes que viene?',
        '¿En qué meses históricamente vendo más?',
        '¿Cuánto efectivo voy a tener a fin de mes?',
      ],
    });
  }

  if (hasMarketing) {
    groups.push({
      label: 'Marketing',
      chips: [
        '¿Cómo está mi inversión en publicidad?',
        '¿Cuál es mi campaña con mejor ROAS?',
        '¿Estoy gastando bien en publicidad?',
      ],
    });
  }

  if (hasStock) {
    groups.push({
      label: 'Inventario',
      chips: [
        '¿Qué productos necesito reponer urgente?',
        '¿Tengo sobrestock en algún producto?',
        '¿Cuántos días de cobertura tengo en promedio?',
      ],
    });
  }

  if (hasClientes) {
    groups.push({
      label: 'Clientes',
      chips: [
        '¿Quiénes son mis mejores clientes?',
        '¿Tengo clientes que no compraron hace mucho?',
        '¿Cuánto tengo pendiente de cobro?',
      ],
    });
  }

  if (hasGastos && hasVentas) {
    groups.push({
      label: 'Acciones recomendadas',
      chips: [
        '¿Qué debería hacer esta semana para mejorar resultados?',
        '¿Hay algo que me esté costando plata sin que me dé cuenta?',
        '¿Cuál es mi margen real este período?',
      ],
    });
  }

  // Fallback if no data loaded yet
  if (groups.length === 0) {
    groups.push({
      label: 'Para empezar',
      chips: [
        '¿Qué archivos debería cargar primero?',
        '¿Cómo puedo analizar la rentabilidad de mi negocio?',
        '¿Qué métricas son más importantes para una PyME?',
      ],
    });
  }

  return groups;
}

// ─── Streaming chat ───────────────────────────────────────────────
async function streamChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: Message[];
  context?: Record<string, unknown>;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  try {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })), context }),
      signal,
    });

    if (!resp.ok) {
      const body = await resp.text();
      let errorMsg = 'Error del servidor';
      try { const parsed = JSON.parse(body); errorMsg = parsed.error || errorMsg; } catch { /* use default */ }
      if (resp.status === 429) errorMsg = 'Demasiadas consultas. Esperá un momento e intentá de nuevo.';
      if (resp.status === 402) errorMsg = 'Créditos agotados. Contactá al administrador.';
      onError(errorMsg);
      return;
    }

    if (!resp.body) { onError('No se recibió respuesta'); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    while (!done) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { done = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (raw.startsWith(':') || raw.trim() === '') continue;
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }
    onDone();
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    onError(err.message || 'Error de conexión');
  }
}

// ─── Search (non-streaming) ──────────────────────────────────────
async function searchChat({
  messages,
  context,
  signal,
}: {
  messages: Message[];
  context?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<{ content: string; citations: string[] }> {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      context: context ? `${(context as any).companyName || ''} - ${(context as any).industry || ''}` : undefined,
      mode: 'search',
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text();
    let errorMsg = 'Error de búsqueda';
    try { const parsed = JSON.parse(body); errorMsg = parsed.error || errorMsg; } catch { /* */ }
    throw new Error(errorMsg);
  }

  return resp.json();
}

// ─── Components ──────────────────────────────────────────────────
function Citations({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fuentes</p>
      {urls.map((url, i) => {
        let domain = url;
        try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* */ }
        return (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-primary hover:underline truncate">
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{domain}</span>
          </a>
        );
      })}
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
       <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
         isUser
           ? 'bg-primary text-primary-foreground rounded-br-md'
           : 'bg-card text-foreground rounded-bl-md border border-border'
       }`}>
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
            {message.citations && <Citations urls={message.citations} />}
          </>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-card rounded-lg p-0.5 border border-border">
      <button
        onClick={() => onChange('chat')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'chat' ? 'bg-primary/30 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </button>
      <button
        onClick={() => onChange('search')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'search' ? 'bg-primary/30 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Globe className="h-3.5 w-3.5" />
        Investigar
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export function AICopilot() {
  const { profile, companyName, companySettings, user } = useAuth();
  const { data: extractedData, mappings, hasData } = useExtractedData();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { period } = usePeriod();

  const currentPeriodLabel = period === 'all'
    ? 'todo el historial disponible'
    : /^\d{4}$/.test(period)
      ? `el año ${period}`
      : /^\d{4}-\d{2}$/.test(period)
        ? (() => {
            const [y, m] = period.split('-');
            const d = new Date(Number(y), Number(m) - 1, 1);
            return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
          })()
        : period;

  // ── Build live period KPIs from extracted data ───────────────
  const mV = mappings.ventas;
  const mG = mappings.gastos;
  const mM = mappings.marketing;
  const allVentas = extractedData?.ventas || [];
  const allGastos = extractedData?.gastos || [];
  const allMarketing = extractedData?.marketing || [];
  const allStock = extractedData?.stock || [];
  const allClientes = extractedData?.clientes || [];

  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, mV?.date));
  const realGastos = period === 'all' ? allGastos : filterByPeriod(allGastos, FIELD_DATE, period, (row) => findDateRaw(row, mG?.date));
  const realMarketing = period === 'all' ? allMarketing : filterByPeriod(allMarketing, FIELD_DATE, period, (row) => findDateRaw(row, mM?.date));

  const salesTotal = realVentas.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT, mV?.amount), 0);
  const gastosTotal = realGastos.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT, mG?.amount), 0);
  const marketingSpend = realMarketing.reduce((s: number, r: any) => s + findNumber(r, FIELD_SPEND, mM?.spend), 0);
  const ganancia = salesTotal - gastosTotal;
  const margen = salesTotal > 0 ? Math.round((ganancia / salesTotal) * 100) : null;

  // Short summary string for the period — sent as supplement to server context
  const liveKPIs: string[] = [];
  if (salesTotal > 0) liveKPIs.push(`Ventas del período: ${formatCurrency(salesTotal)} (${realVentas.length} registros)`);
  if (gastosTotal > 0) liveKPIs.push(`Gastos del período: ${formatCurrency(gastosTotal)}`);
  if (ganancia !== 0 && salesTotal > 0 && gastosTotal > 0) liveKPIs.push(`Resultado neto: ${formatCurrency(ganancia)}${margen !== null ? ` (${margen}% margen)` : ''}`);
  if (marketingSpend > 0) liveKPIs.push(`Inversión publicitaria: ${formatCurrency(marketingSpend)}`);
  if (allStock.length > 0) liveKPIs.push(`Stock: ${allStock.length} registros de inventario`);

  const hasVentas = allVentas.length > 0;
  const hasGastos = allGastos.length > 0;
  const hasMarketing = allMarketing.length > 0;
  const hasStock = allStock.length > 0;
  const hasClientes = allClientes.length > 0;
  const chipGroups = buildChipGroups(hasVentas, hasGastos, hasMarketing, hasStock, hasClientes);

  const businessContext = {
    companyId: profile?.company_id,
    userId: user?.id, // Ola 20: para registrar quién hizo la consulta en api_usage_logs
    companyName,
    industry: (companySettings as any)?.industry,
    sellsProducts: companySettings?.sells_products,
    sellsServices: companySettings?.sells_services,
    hasStock: companySettings?.has_stock,
    hasLogistics: companySettings?.has_logistics,
    usesMetaAds: companySettings?.uses_meta_ads,
    usesGoogleAds: companySettings?.uses_google_ads,
    currentPeriod: period,
    currentPeriodLabel,
    // Live period KPIs from client-side extracted data
    livePeriodSummary: liveKPIs.length > 0 ? `KPIs del período (${currentPeriodLabel}): ${liveKPIs.join('. ')}.` : null,
    hasData,
    availableModules: [
      hasVentas && 'ventas',
      hasGastos && 'gastos',
      hasMarketing && 'marketing',
      hasStock && 'stock',
      hasClientes && 'clientes',
    ].filter(Boolean),
  };

  const MAX_STORED = 20;
  const companyId = profile?.company_id;

  // ── Persist helpers ──────────────────────────────────────────
  const saveMessages = useCallback(async (msgs: Message[]) => {
    if (!companyId) return;
    const trimmed = msgs.slice(-MAX_STORED).map(({ role, content, citations }) => ({ role, content, ...(citations?.length ? { citations } : {}) }));
    await supabase.from('copilot_conversations' as any)
      .upsert({ company_id: companyId, messages: trimmed, updated_at: new Date().toISOString() } as any, { onConflict: 'company_id' });
  }, [companyId]);

  // Load on mount
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase.from('copilot_conversations' as any).select('messages').eq('company_id', companyId).maybeSingle();
      if (data && Array.isArray((data as any).messages)) {
        const stored = ((data as any).messages as StoredMessage[])
          .filter((m: StoredMessage) => m.role === 'user' || m.role === 'assistant')
          .map((m: StoredMessage) => ({ role: m.role as 'user' | 'assistant', content: m.content, ...(m.citations ? { citations: m.citations } : {}) }));
        if (stored.length) setMessages(stored);
      }
    })();
  }, [companyId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => {
    if (open && !isLoading) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open, isLoading]);

  const handleNewConversation = async () => {
    setMessages([]);
    setError(null);
    if (companyId) {
      await supabase.from('copilot_conversations' as any).delete().eq('company_id', companyId);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMsg: Message = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    if (mode === 'search') {
      try {
        const result = await searchChat({ messages: next, context: businessContext, signal: controller.signal });
        const final = [...next, { role: 'assistant' as const, content: result.content, citations: result.citations }];
        setMessages(final);
        saveMessages(final);
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message || 'Error de búsqueda');
        saveMessages(next);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Streaming chat
    let assistantSoFar = '';
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const current = assistantSoFar;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: current } : m));
        }
        return [...prev, { role: 'assistant', content: current }];
      });
    };

    await streamChat({
      messages: next,
      context: businessContext,
      onDelta: upsertAssistant,
      onDone: () => {
        setIsLoading(false);
        setMessages(prev => { saveMessages(prev); return prev; });
      },
      onError: (msg) => { setError(msg); setIsLoading(false); saveMessages(next); },
      signal: controller.signal,
    });
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* FAB */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-shadow"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 260, damping: 20 }}
      >
        <MessageCircle className="h-6 w-6" />
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md bg-background border-l border-border z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/30 flex items-center justify-center">
                    <Sparkles className="h-4.5 w-4.5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tracking-tight">Preguntale a {APP_NAME}</p>
                    <p className="text-[11px] text-muted-foreground">Tu copiloto de negocios</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {hasMessages && (
                    <Button variant="ghost" size="icon" onClick={handleNewConversation} className="h-8 w-8" title="Nueva conversación">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="px-5 py-2.5 border-b border-border">
                <ModeToggle mode={mode} onChange={setMode} />
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-4">
                {!hasMessages && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center pt-8">
                    <div className="h-14 w-14 rounded-2xl bg-primary/30 flex items-center justify-center mx-auto mb-4">
                      {mode === 'search' ? <Globe className="h-7 w-7 text-foreground" /> : <Sparkles className="h-7 w-7 text-foreground" />}
                    </div>
                    <h3 className="text-base font-bold tracking-tight mb-1">
                      {mode === 'search' ? '¿Qué querés investigar?' : '¿En qué te puedo ayudar?'}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-6">
                      {mode === 'search'
                        ? 'Buscá información de mercado, competencia o tendencias de tu industria.'
                        : 'Preguntame sobre ventas, finanzas, clientes o cualquier aspecto de tu negocio.'}
                    </p>
                    {mode === 'chat' && (
                      <div className="space-y-4 text-left">
                        {chipGroups.map((group, gi) => (
                          <div key={gi}>
                            <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">{group.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.chips.map((chip, ci) => (
                                <motion.button
                                  key={ci}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.3 + gi * 0.1 + ci * 0.04 }}
                                  onClick={() => sendMessage(chip)}
                                  className="bg-muted border border-border rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
                                >
                                  {chip}
                                </motion.button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {messages.map((msg, i) => <ChatMessage key={i} message={msg} />)}

                {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-card rounded-2xl rounded-bl-md px-4 py-3 border border-border">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 alert-error rounded-lg px-3 py-2 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Input */}
               <form onSubmit={handleSubmit} className="p-4 border-t border-border">
                 <div className="flex items-center gap-2 bg-card rounded-xl px-4 py-3 border border-border focus-within:border-primary/50 transition-colors">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={mode === 'search' ? 'Buscá tendencias, competencia, mercado...' : 'Preguntale algo a tu negocio...'}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                    disabled={isLoading}
                  />
                  <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={isLoading || !input.trim()}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
