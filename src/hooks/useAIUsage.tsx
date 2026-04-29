/**
 * useAIUsage (Ola 20).
 *
 * Carga los logs de api_usage_logs y los agrega para el panel de Uso de IA.
 * Degrada graceful si la migración aún no se aplicó (devuelve arrays vacíos).
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ApiUsageLog {
  id: string;
  company_id: string;
  user_id: string | null;
  provider: 'openai' | 'perplexity' | 'anthropic';
  model: string;
  feature: string;
  input_tokens: number;
  input_tokens_cached: number | null;
  output_tokens: number;
  cost_usd: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type UsageRange = '7d' | '30d' | '90d' | 'all';

export function useAIUsage(range: UsageRange = '30d') {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const [logs, setLogs] = useState<ApiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      let query = sb.from('api_usage_logs').select('*').eq('company_id', companyId).order('created_at', { ascending: false });

      if (range !== 'all') {
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        query = query.gte('created_at', since);
      }

      const { data, error: e } = await query.limit(5000);
      if (e) {
        const errCode = (e as { code?: string }).code;
        const errMsg = (e as { message?: string }).message ?? '';
        if (errCode === '42P01' || errMsg.includes('does not exist')) {
          console.warn('[useAIUsage] api_usage_logs table not ready yet (migration pending).');
          setLogs([]);
          return;
        }
        throw e;
      }
      setLogs((data as ApiUsageLog[]) || []);
    } catch (err) {
      const e = err as { message?: string };
      console.error('[useAIUsage] fetch error:', e);
      setError(e.message || 'Error al cargar uso de IA');
    } finally {
      setLoading(false);
    }
  }, [companyId, range]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Agregaciones
  const totals = useMemo(() => {
    const total = logs.reduce((s, l) => s + Number(l.cost_usd), 0);
    const inputTokens = logs.reduce((s, l) => s + l.input_tokens, 0);
    const outputTokens = logs.reduce((s, l) => s + l.output_tokens, 0);
    const cachedTokens = logs.reduce((s, l) => s + (l.input_tokens_cached || 0), 0);
    return { total, inputTokens, outputTokens, cachedTokens, count: logs.length };
  }, [logs]);

  const byProvider = useMemo(() => {
    const map = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const l of logs) {
      const cur = map.get(l.provider) || { cost: 0, tokens: 0, count: 0 };
      cur.cost += Number(l.cost_usd);
      cur.tokens += l.input_tokens + l.output_tokens;
      cur.count += 1;
      map.set(l.provider, cur);
    }
    return Array.from(map.entries()).map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.cost - a.cost);
  }, [logs]);

  const byModel = useMemo(() => {
    const map = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const l of logs) {
      const cur = map.get(l.model) || { cost: 0, tokens: 0, count: 0 };
      cur.cost += Number(l.cost_usd);
      cur.tokens += l.input_tokens + l.output_tokens;
      cur.count += 1;
      map.set(l.model, cur);
    }
    return Array.from(map.entries()).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost);
  }, [logs]);

  const byFeature = useMemo(() => {
    const map = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const l of logs) {
      const cur = map.get(l.feature) || { cost: 0, tokens: 0, count: 0 };
      cur.cost += Number(l.cost_usd);
      cur.tokens += l.input_tokens + l.output_tokens;
      cur.count += 1;
      map.set(l.feature, cur);
    }
    return Array.from(map.entries()).map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost - a.cost);
  }, [logs]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      const day = l.created_at.slice(0, 10);
      map.set(day, (map.get(day) || 0) + Number(l.cost_usd));
    }
    return Array.from(map.entries())
      .map(([day, cost]) => ({ day, cost }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [logs]);

  return {
    logs,
    loading,
    error,
    refetch: fetchAll,
    totals,
    byProvider,
    byModel,
    byFeature,
    byDay,
  };
}
