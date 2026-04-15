import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Loader2, AlertCircle, Globe, MessageSquare, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = { role: 'user' | 'assistant'; content: string; citations?: string[] };
type Mode = 'chat' | 'search';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const suggestions = [
  '¿Cuál es mi producto más rentable?',
  '¿Qué cliente me conviene recuperar?',
  'Dame un resumen de mis ventas del último mes',
  '¿Cómo está mi stock? ¿Hay algo crítico?',
  '¿Qué acción concreta me recomendás hoy?',
];

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
          mode === 'chat' ? 'bg-[#1f2a0f] text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </button>
      <button
        onClick={() => onChange('search')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'search' ? 'bg-[#1f2a0f] text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
  const { profile, companyName, companySettings } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const businessContext = {
    companyId: profile?.company_id,
    companyName,
    industry: (companySettings as any)?.industry,
    sellsProducts: companySettings?.sells_products,
    sellsServices: companySettings?.sells_services,
    hasStock: companySettings?.has_stock,
    hasLogistics: companySettings?.has_logistics,
    usesMetaAds: companySettings?.uses_meta_ads,
    usesGoogleAds: companySettings?.uses_google_ads,
  };

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => {
    if (open && !isLoading) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open, isLoading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const allMessages = [...messages, userMsg];

    if (mode === 'search') {
      try {
        const result = await searchChat({ messages: allMessages, context: businessContext, signal: controller.signal });
        setMessages(prev => [...prev, { role: 'assistant', content: result.content, citations: result.citations }]);
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message || 'Error de búsqueda');
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
      messages: allMessages,
      context: businessContext,
      onDelta: upsertAssistant,
      onDone: () => setIsLoading(false),
      onError: (msg) => { setError(msg); setIsLoading(false); },
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
              className="fixed right-0 top-0 bottom-0 w-full sm:max-w-md bg-background border-l border-[#1f1f1f] z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-[#1f2a0f] flex items-center justify-center">
                    <Sparkles className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tracking-tight">Preguntale a {APP_NAME}</p>
                    <p className="text-[11px] text-muted-foreground">Tu copiloto de negocios</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Mode toggle */}
              <div className="px-5 py-2.5 border-b border-[#1f1f1f]">
                <ModeToggle mode={mode} onChange={setMode} />
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-4">
                {!hasMessages && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center pt-8">
                    <div className="h-14 w-14 rounded-2xl bg-[#1f2a0f] flex items-center justify-center mx-auto mb-4">
                      {mode === 'search' ? <Globe className="h-7 w-7 text-primary" /> : <Sparkles className="h-7 w-7 text-primary" />}
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
                      <div className="space-y-2 text-left">
                        {suggestions.map((s, i) => (
                          <motion.button key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }}
                            onClick={() => sendMessage(s)}
                            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-left"
                          >{s}</motion.button>
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
               <form onSubmit={handleSubmit} className="p-4 border-t border-[#1f1f1f]">
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
