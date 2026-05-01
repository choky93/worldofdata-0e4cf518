/**
 * useSuppliers (Ola 15).
 *
 * Hook para CRUD de proveedores + cálculo de lead time real desde
 * supplier_deliveries. Se usa desde Proveedores.tsx (page) y desde
 * Stock.tsx (alertas con lead time real, en Ola 16).
 *
 * NOTA: las tablas suppliers / supplier_products / supplier_deliveries
 * fueron creadas en la migración 20260429100000_suppliers.sql. Hasta que
 * Lovable regenere los tipos, las queries usan `from('table' as any)`
 * con casts manuales — esto NO afecta el runtime, solo hace que TS
 * acepte el código. Cuando llegue la ola que regenere types.ts, se
 * pueden quitar los casts.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cuit: string | null;
  contact_person: string | null;
  lead_time_promised_days: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  company_id: string;
  product_name: string;
  supplier_sku: string | null;
  lead_time_override_days: number | null;
  notes: string | null;
  created_at: string;
}

export interface SupplierDelivery {
  id: string;
  supplier_id: string;
  company_id: string;
  ordered_at: string;
  promised_at: string | null;
  received_at: string | null;
  status: 'pending' | 'received' | 'cancelled' | 'partial';
  quantity: number | null;
  notes: string | null;
  created_at: string;
}

/** Lead time real calculado desde entregas recibidas: avg(received - ordered). */
export function computeRealLeadTime(deliveries: SupplierDelivery[]): number | null {
  const completed = deliveries.filter(d => d.status === 'received' && d.received_at && d.ordered_at);
  if (completed.length === 0) return null;
  const totalDays = completed.reduce((sum, d) => {
    const ordered = new Date(d.ordered_at).getTime();
    const received = new Date(d.received_at!).getTime();
    return sum + Math.max(0, Math.round((received - ordered) / 86400000));
  }, 0);
  return Math.round(totalDays / completed.length);
}

/** Diferencia promedio promesa vs. realidad: avg(received - promised). Negativo = más rápido. */
export function computeDeliveryAccuracy(deliveries: SupplierDelivery[]): number | null {
  const completed = deliveries.filter(d => d.status === 'received' && d.received_at && d.promised_at);
  if (completed.length === 0) return null;
  const totalDays = completed.reduce((sum, d) => {
    const promised = new Date(d.promised_at!).getTime();
    const received = new Date(d.received_at!).getTime();
    return sum + Math.round((received - promised) / 86400000);
  }, 0);
  return Math.round(totalDays / completed.length);
}

export function useSuppliers() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveries, setDeliveries] = useState<SupplierDelivery[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
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
      const [{ data: sData, error: sErr }, { data: dData, error: dErr }, { data: pData, error: pErr }] = await Promise.all([
        sb.from('suppliers').select('*').eq('company_id', companyId).order('name', { ascending: true }),
        sb.from('supplier_deliveries').select('*').eq('company_id', companyId).order('ordered_at', { ascending: false }),
        sb.from('supplier_products').select('*').eq('company_id', companyId),
      ]);
      // Si la migración aún no se aplicó (table missing), degradamos a vacío
      // sin tirar — así Stock.tsx sigue funcionando con el lead time default.
      const isMissingTableErr = (e: { code?: string; message?: string } | null) =>
        !!e && (e.code === '42P01' || (e.message ?? '').includes('does not exist'));
      if (sErr && !isMissingTableErr(sErr)) throw sErr;
      if (dErr && !isMissingTableErr(dErr)) throw dErr;
      if (pErr && !isMissingTableErr(pErr)) throw pErr;
      if (sErr || dErr || pErr) {
        console.warn('[useSuppliers] suppliers tables not ready yet (migration pending). Continuing with empty data.');
      }
      setSuppliers((sData as Supplier[]) || []);
      setDeliveries((dData as SupplierDelivery[]) || []);
      setProducts((pData as SupplierProduct[]) || []);
    } catch (err) {
      const e = err as { message?: string };
      console.error('[useSuppliers] fetch error:', e);
      setError(e.message || 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createSupplier = async (data: Omit<Supplier, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'active'>) => {
    if (!companyId) throw new Error('Sin company_id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: row, error: e } = await sb.from('suppliers').insert({ ...data, company_id: companyId }).select().single();
    if (e) throw e;
    await fetchAll();
    return row as Supplier;
  };

  const updateSupplier = async (id: string, patch: Partial<Supplier>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('suppliers').update(patch).eq('id', id);
    if (e) throw e;
    await fetchAll();
  };

  const deleteSupplier = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('suppliers').delete().eq('id', id);
    if (e) throw e;
    // AUDIT FIX: limpiar también la lista de pedido en localStorage del
    // proveedor borrado. Si no, los items quedaban huérfanos en
    // bySupplier[id-borrado], invisibles pero contados por
    // getTotalPendingItems.
    try {
      const mod = await import('@/lib/purchase-orders');
      mod.clearOrder(id);
    } catch (cleanupErr) {
      console.warn('[deleteSupplier] cleanup of orders failed (non-blocking):', cleanupErr);
    }
    await fetchAll();
  };

  // Ola 22 + Codex P1/P2 fix: vincular un producto a un proveedor.
  // Si ya existe la combinación supplier+name, hace upsert. Si pasamos
  // supplierId=null, des-asigna (DELETE).
  //
  // CODEX P1: usábamos `ilike('product_name', trimmed)` que interpreta
  //   `%` y `_` como comodines SQL. Un producto "Alcohol 70%" hubiera
  //   borrado/matcheado otros productos al hacer delete. Cambiado a
  //   match exacto case-insensitive en TypeScript: traemos los rows del
  //   producto y filtramos en JS por nombre normalizado, después
  //   borramos por id (sin riesgo de wildcards).
  // CODEX P2: el upsert seteaba supplier_sku y lead_time_override_days
  //   a null cuando opts no los traía → pisaba metadata existente.
  //   Ahora solo incluimos esos campos si vienen explícitos en opts.
  const assignProductToSupplier = async (
    productName: string,
    supplierId: string | null,
    opts?: { leadTimeOverrideDays?: number | null; supplierSku?: string | null },
  ) => {
    if (!companyId) throw new Error('Sin company_id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const trimmed = productName.trim();
    if (!trimmed) throw new Error('Nombre de producto vacío');
    const normalizedTarget = trimmed.toLowerCase();

    // Codex P1: en vez de DELETE...ILIKE (riesgo de wildcards), traemos
    // todos los supplier_products de la company y filtramos en JS por
    // match exacto case-insensitive. Después borramos por id.
    const { data: allLinks, error: fetchErr } = await sb
      .from('supplier_products')
      .select('id, product_name, supplier_id')
      .eq('company_id', companyId);
    if (fetchErr) throw fetchErr;
    const matchingIds = ((allLinks || []) as { id: string; product_name: string; supplier_id: string }[])
      .filter(r => (r.product_name || '').trim().toLowerCase() === normalizedTarget)
      .map(r => ({ id: r.id, supplier_id: r.supplier_id }));

    // Si supplierId es null, des-asignar todos los vínculos del producto
    if (supplierId === null) {
      if (matchingIds.length === 0) { await fetchAll(); return; }
      const { error: delErr } = await sb
        .from('supplier_products')
        .delete()
        .in('id', matchingIds.map(m => m.id));
      if (delErr) throw delErr;
      await fetchAll();
      return;
    }

    // Eliminar vínculos del MISMO producto a OTROS proveedores (regla:
    // un producto = un proveedor). Conservamos el match con supplierId
    // si ya existe, para que el upsert posterior preserve metadata.
    const idsToDelete = matchingIds.filter(m => m.supplier_id !== supplierId).map(m => m.id);
    if (idsToDelete.length > 0) {
      const { error: cleanErr } = await sb
        .from('supplier_products')
        .delete()
        .in('id', idsToDelete);
      if (cleanErr) throw cleanErr;
    }

    // Codex P2: construir el payload del upsert sin campos undefined.
    // Solo incluimos supplier_sku / lead_time_override_days si vinieron
    // explícitos en opts. Si no, el upsert no toca esos campos en el
    // row existente (preserva la metadata).
    //
    // AUDIT FIX: persistimos product_name normalizado (lowercase) para
    // que la UNIQUE constraint case-sensitive de Postgres no permita
    // duplicados con casing distinto ("Leche" vs "leche"). El nombre
    // "display" original se preserva para la UI a partir del archivo
    // de stock (que SI mantiene el casing).
    const upsertPayload: Record<string, unknown> = {
      supplier_id: supplierId,
      company_id: companyId,
      product_name: normalizedTarget, // siempre lowercase
    };
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'supplierSku')) {
      upsertPayload.supplier_sku = opts.supplierSku;
    }
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'leadTimeOverrideDays')) {
      upsertPayload.lead_time_override_days = opts.leadTimeOverrideDays;
    }

    const { error: upErr } = await sb
      .from('supplier_products')
      .upsert(upsertPayload, { onConflict: 'supplier_id,product_name' });
    if (upErr) throw upErr;
    await fetchAll();
  };

  const createDelivery = async (data: Omit<SupplierDelivery, 'id' | 'company_id' | 'created_at'>) => {
    if (!companyId) throw new Error('Sin company_id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('supplier_deliveries').insert({ ...data, company_id: companyId });
    if (e) throw e;
    await fetchAll();
  };

  const updateDelivery = async (id: string, patch: Partial<SupplierDelivery>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: e } = await sb.from('supplier_deliveries').update(patch).eq('id', id);
    if (e) throw e;
    await fetchAll();
  };

  // Helpers de agregación por proveedor
  const deliveriesBySupplier = (supplierId: string) => deliveries.filter(d => d.supplier_id === supplierId);
  const productsBySupplier = (supplierId: string) => products.filter(p => p.supplier_id === supplierId);

  /**
   * Lead time efectivo (días) que debería usar el cálculo de stock para un producto:
   *   1) Si hay un override específico en supplier_products → ese.
   *   2) Si hay deliveries reales → avg de received-ordered.
   *   3) Si hay lead_time_promised_days → ese.
   *   4) null (caller usa fallback global).
   */
  const getEffectiveLeadTimeForProduct = (productName: string): { days: number; supplier?: Supplier; source: 'override' | 'real' | 'promised' | null } => {
    const norm = productName.trim().toLowerCase();
    const sp = products.find(p => p.product_name.trim().toLowerCase() === norm);
    if (!sp) return { days: 0, source: null };
    const supplier = suppliers.find(s => s.id === sp.supplier_id);
    if (!supplier) return { days: 0, source: null };

    if (sp.lead_time_override_days != null && sp.lead_time_override_days > 0) {
      return { days: sp.lead_time_override_days, supplier, source: 'override' };
    }
    const real = computeRealLeadTime(deliveriesBySupplier(supplier.id));
    if (real != null) return { days: real, supplier, source: 'real' };
    if (supplier.lead_time_promised_days && supplier.lead_time_promised_days > 0) {
      return { days: supplier.lead_time_promised_days, supplier, source: 'promised' };
    }
    return { days: 0, supplier, source: null };
  };

  return {
    suppliers,
    deliveries,
    products,
    loading,
    error,
    refetch: fetchAll,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createDelivery,
    updateDelivery,
    deliveriesBySupplier,
    productsBySupplier,
    getEffectiveLeadTimeForProduct,
    assignProductToSupplier,
  };
}
