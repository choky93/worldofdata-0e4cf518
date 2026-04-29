/**
 * useDeleteRequests (Ola 17).
 *
 * Hook para gestionar solicitudes de borrado de archivos.
 * - Employee: crea una solicitud con motivo. No puede aprobarla.
 * - Admin: ve pendientes, aprueba (ejecuta el delete real) o rechaza.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DeleteRequest {
  id: string;
  company_id: string;
  file_upload_id: string | null;
  file_name: string;
  requested_by: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface DeleteRequestWithUser extends DeleteRequest {
  requester_name: string | null;
}

export function useDeleteRequests() {
  const { profile, role, user } = useAuth();
  const companyId = profile?.company_id;
  const userId = user?.id;
  const [requests, setRequests] = useState<DeleteRequestWithUser[]>([]);
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
      const { data: reqs, error: e } = await sb
        .from('delete_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      // Si la migración aún no se aplicó, degradamos a vacío sin romper.
      if (e) {
        const errCode = (e as { code?: string }).code;
        const errMsg = (e as { message?: string }).message ?? '';
        if (errCode === '42P01' || errMsg.includes('does not exist')) {
          console.warn('[useDeleteRequests] table not ready yet (migration pending).');
          setRequests([]);
          return;
        }
        throw e;
      }

      const items = (reqs as DeleteRequest[]) || [];

      // Resolver nombres de los solicitantes
      const userIds = Array.from(new Set(items.map(r => r.requested_by)));
      const { data: profs } = userIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] as { id: string; full_name: string | null }[] };

      const profMap = new Map<string, string | null>();
      (profs || []).forEach(p => profMap.set(p.id, p.full_name));

      setRequests(items.map(r => ({
        ...r,
        requester_name: profMap.get(r.requested_by) ?? null,
      })));
    } catch (err) {
      const e = err as { message?: string };
      console.error('[useDeleteRequests] fetch error:', e);
      setError(e.message || 'Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /** Crear una solicitud (employee). */
  const requestDelete = async (file: { id: string; name: string }, reason: string) => {
    if (!companyId || !userId) throw new Error('Sin sesión válida');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('delete_requests').insert({
      company_id: companyId,
      file_upload_id: file.id,
      file_name: file.name,
      requested_by: userId,
      reason: reason.trim() || null,
      status: 'pending',
    });
    if (e) throw e;
    await fetchAll();
  };

  /** Aprobar (admin): hace el delete real + marca la request como approved. */
  const approveRequest = async (req: DeleteRequest, note?: string) => {
    if (role !== 'admin') throw new Error('Solo el admin puede aprobar');
    if (!userId) throw new Error('Sin sesión válida');
    // 1) Borrar el file_upload (cascade limpia file_extracted_data, etc.)
    if (req.file_upload_id) {
      const { error: delErr } = await supabase.from('file_uploads').delete().eq('id', req.file_upload_id);
      if (delErr) throw delErr;
    }
    // 2) Marcar la request como approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: updErr } = await sb.from('delete_requests').update({
      status: 'approved',
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    }).eq('id', req.id);
    if (updErr) throw updErr;
    await fetchAll();
  };

  /** Rechazar (admin): NO borra el archivo, solo marca rejected. */
  const rejectRequest = async (req: DeleteRequest, note: string) => {
    if (role !== 'admin') throw new Error('Solo el admin puede rechazar');
    if (!userId) throw new Error('Sin sesión válida');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('delete_requests').update({
      status: 'rejected',
      decided_by: userId,
      decided_at: new Date().toISOString(),
      decision_note: note.trim() || null,
    }).eq('id', req.id);
    if (e) throw e;
    await fetchAll();
  };

  const pending = requests.filter(r => r.status === 'pending');
  const myPending = pending.filter(r => r.requested_by === userId);

  return {
    requests,
    pending,
    myPending,
    loading,
    error,
    refetch: fetchAll,
    requestDelete,
    approveRequest,
    rejectRequest,
  };
}
