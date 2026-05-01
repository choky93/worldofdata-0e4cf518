/**
 * Purchase orders / lista de compras (Ola 23).
 *
 * Lucas pidió: "una opción que diga 'Agregar a pedido' en cada tarjeta
 * de alerta de Stock, y que adentro del proveedor ya esté cargado todo
 * lo que quiero pedir, con la posibilidad de cuántos quiero — 30, 60 ó
 * 90 días de cobertura — y que se arme una listita de compras".
 *
 * Persistencia: localStorage por navegador (simple, sin migration). Si
 * después se quiere multi-device, migramos a una tabla 'purchase_orders'
 * en Supabase con RLS por company. Para el alcance actual alcanza con
 * localStorage por usuario/navegador.
 *
 * Estructura: { [supplierId]: PurchaseOrderItem[] }. Por cada proveedor
 * tenés una lista de items en preparación.
 */

const STORAGE_KEY = 'wod.purchaseOrders.v1';

export interface PurchaseOrderItem {
  productName: string;
  quantity: number;
  /** Notas opcionales del usuario al agregar el item. */
  notes?: string;
  /** Snapshot de datos de stock al momento de agregar (para mostrar en la lista). */
  unitCost?: number;
  currentStock?: number;
  coverageDays?: number;
  avgMonthlyUnits?: number;
  addedAt: string;
}

interface Store {
  /** supplierId → lista de items en preparación */
  bySupplier: Record<string, PurchaseOrderItem[]>;
}

const DEFAULT: Store = { bySupplier: {} };

let cache: Store | null = null;
const subs = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = { bySupplier: {} };
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { bySupplier: {} };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<Store>;
    cache = { bySupplier: parsed.bySupplier || {} };
    return cache;
  } catch {
    cache = { bySupplier: {} };
    return cache;
  }
}

function write(next: Store) {
  cache = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // localStorage may be unavailable.
  }
  for (const fn of subs) fn();
}

export function getOrderItems(supplierId: string): PurchaseOrderItem[] {
  return read().bySupplier[supplierId] || [];
}

export function getAllOrders(): Store['bySupplier'] {
  return { ...read().bySupplier };
}

/** Saber si un producto ya está en la lista del proveedor (para que el caller decida sumar o reemplazar). */
export function hasOrderItem(supplierId: string, productName: string): boolean {
  if (!supplierId) return false;
  const list = read().bySupplier[supplierId] || [];
  const norm = productName.trim().toLowerCase();
  return list.some(i => i.productName.trim().toLowerCase() === norm);
}

/**
 * Agrega un item al pedido del proveedor.
 *  - mode='replace' (default): si el producto ya estaba, REEMPLAZA la cantidad.
 *  - mode='add': SUMA la cantidad nueva a la existente.
 *
 * AUDIT FIX: antes siempre sumaba. Si el usuario abría el dialog 2 veces
 * sin querer, terminaba con cantidad inflada x2. Ahora replace es el
 * default; el dialog ofrece "+ Sumar" como modo explícito cuando detecta
 * que ya existe.
 */
export function addOrderItem(
  supplierId: string,
  item: PurchaseOrderItem,
  mode: 'replace' | 'add' = 'replace',
) {
  if (!supplierId || !item.productName.trim()) return;
  const cur = read();
  const existing = cur.bySupplier[supplierId] || [];
  const norm = item.productName.trim().toLowerCase();
  const idx = existing.findIndex(i => i.productName.trim().toLowerCase() === norm);
  let nextList: PurchaseOrderItem[];
  if (idx >= 0) {
    const newQty = mode === 'add' ? existing[idx].quantity + item.quantity : item.quantity;
    const merged: PurchaseOrderItem = {
      ...existing[idx],
      quantity: newQty,
      unitCost: item.unitCost ?? existing[idx].unitCost,
      currentStock: item.currentStock ?? existing[idx].currentStock,
      coverageDays: item.coverageDays ?? existing[idx].coverageDays,
      avgMonthlyUnits: item.avgMonthlyUnits ?? existing[idx].avgMonthlyUnits,
      notes: item.notes ?? existing[idx].notes,
      addedAt: new Date().toISOString(),
    };
    nextList = [...existing.slice(0, idx), merged, ...existing.slice(idx + 1)];
  } else {
    nextList = [...existing, { ...item, addedAt: new Date().toISOString() }];
  }
  write({
    bySupplier: { ...cur.bySupplier, [supplierId]: nextList },
  });
}

export function updateOrderQuantity(supplierId: string, productName: string, qty: number) {
  if (qty <= 0) {
    removeOrderItem(supplierId, productName);
    return;
  }
  const cur = read();
  const list = cur.bySupplier[supplierId] || [];
  const norm = productName.trim().toLowerCase();
  const next = list.map(i =>
    i.productName.trim().toLowerCase() === norm ? { ...i, quantity: qty } : i
  );
  write({ bySupplier: { ...cur.bySupplier, [supplierId]: next } });
}

export function removeOrderItem(supplierId: string, productName: string) {
  const cur = read();
  const list = cur.bySupplier[supplierId] || [];
  const norm = productName.trim().toLowerCase();
  const next = list.filter(i => i.productName.trim().toLowerCase() !== norm);
  if (next.length === 0) {
    const { [supplierId]: _, ...rest } = cur.bySupplier;
    void _;
    write({ bySupplier: rest });
  } else {
    write({ bySupplier: { ...cur.bySupplier, [supplierId]: next } });
  }
}

export function clearOrder(supplierId: string) {
  const cur = read();
  const { [supplierId]: _, ...rest } = cur.bySupplier;
  void _;
  write({ bySupplier: rest });
}

export function subscribePurchaseOrders(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/** Cuántos productos hay en pedidos en total. */
export function getTotalPendingItems(): number {
  const cur = read();
  return Object.values(cur.bySupplier).reduce((s, list) => s + list.length, 0);
}
