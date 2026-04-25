/**
 * AuditTrailPanel (5.16).
 *
 * Surfaces the existing audit_logs table — events are already being written
 * by CargaDatos.tsx (file_uploaded, file_deleted, file_reprocessed). This
 * component just exposes them in a collapsible panel so the user can see
 * who did what and when, without leaving the data page.
 *
 * Read-only. RLS in the DB ensures users only see their own company's logs.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronUp, Loader2, Upload, Trash2, RefreshCw, Tag, Archive, RotateCcw } from 'lucide-react';
import { formatRelativeTime, formatDate } from '@/lib/formatters';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
}

interface ProfileInfo {
  full_name: string | null;
  email: string | null;
}

interface Props {
  companyId: string | null | undefined;
  /** When changes — refetch (e.g. after a new upload). */
  refreshKey?: unknown;
}

const ACTION_META: Record<string, { label: string; icon: typeof Upload; tone: string }> = {
  file_uploaded:    { label: 'Subió archivo',         icon: Upload,    tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  file_deleted:     { label: 'Eliminó archivo',       icon: Trash2,    tone: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  file_reprocessed: { label: 'Reprocesó archivo',     icon: RefreshCw, tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  file_reclassified:{ label: 'Cambió categoría',      icon: Tag,       tone: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  file_archived:    { label: 'Archivó archivo',       icon: Archive,   tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  file_restored:    { label: 'Restauró archivo',      icon: RotateCcw, tone: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
};

const PAGE = 25;

export function AuditTrailPanel({ companyId, refreshKey }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchPage = async (pageNum: number) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const from = pageNum * PAGE;
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, resource_id, metadata, created_at, user_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE);
      if (error) throw error;
      const fetched = (data || []) as AuditLog[];
      const overflow = fetched.length > PAGE;
      const trimmed = overflow ? fetched.slice(0, PAGE) : fetched;
      setHasMore(overflow);
      setLogs(prev => pageNum === 0 ? trimmed : [...prev, ...trimmed]);

      // Resolve unique user_ids → profiles for "who did it"
      const newUserIds = Array.from(new Set(trimmed.map(l => l.user_id).filter(Boolean) as string[]))
        .filter(id => !profiles[id]);
      if (newUserIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', newUserIds);
        if (profs) {
          setProfiles(prev => {
            const next = { ...prev };
            for (const p of profs as { id: string; full_name: string | null; email: string | null }[]) {
              next[p.id] = { full_name: p.full_name, email: p.email };
            }
            return next;
          });
        }
      }
    } catch (err) {
      console.error('audit_logs fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && companyId) {
      setPage(0);
      fetchPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, refreshKey]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Historial de actividad
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(o => !o)}
            className="h-7 gap-1 text-xs"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? 'Ocultar' : 'Ver'}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Sin actividad registrada todavía.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {logs.map(log => {
                  const meta = ACTION_META[log.action] ?? {
                    label: log.action.replace(/_/g, ' '),
                    icon: History,
                    tone: 'bg-muted text-muted-foreground',
                  };
                  const Icon = meta.icon;
                  const fileName = (log.metadata?.file_name as string | undefined) ?? null;
                  const oldCat = (log.metadata?.old_category as string | undefined) ?? null;
                  const newCat = (log.metadata?.new_category as string | undefined) ?? null;
                  const userInfo = log.user_id ? profiles[log.user_id] : null;
                  const userLabel = userInfo?.full_name || userInfo?.email || (log.user_id ? 'Usuario' : 'Sistema');
                  return (
                    <li key={log.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 text-xs">
                      <Badge className={`border-0 shrink-0 gap-1 ${meta.tone}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {fileName && <div className="font-medium truncate">{fileName}</div>}
                        {oldCat && newCat && (
                          <div className="text-muted-foreground">
                            {oldCat} → <span className="font-medium text-foreground">{newCat}</span>
                          </div>
                        )}
                        <div className="text-muted-foreground">
                          {userLabel} · {formatRelativeTime(log.created_at)} · {formatDate(log.created_at)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="mt-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    onClick={() => { const next = page + 1; setPage(next); fetchPage(next); }}
                    className="text-xs"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cargar más'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
