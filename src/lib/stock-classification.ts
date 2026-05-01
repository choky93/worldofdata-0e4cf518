/**
 * Stock classification (Ola 14).
 *
 * Algunos productos NO son inventario físico (servicios, preventas, señas,
 * abonos, anticipos). Si entran al cálculo de stock como si lo fueran,
 * generan falsos positivos de "overstock" porque tienen un stock alto sin
 * rotación real (Lucas reportó: "Servicio de impresión FM" salía como
 * overstock con 55 días de cobertura).
 *
 * Detección:
 *   1) Keywords en el nombre (auto-detect).
 *   2) Override manual del usuario (persistido en localStorage).
 *
 * Esto es per-browser. Cuando agreguemos rol admin + tabla de productos,
 * los overrides manuales pueden moverse a Supabase. Mientras tanto, una
 * preferencia local funciona bien para el caso de uso del cliente.
 */

const STORAGE_KEY = 'wod.stockExclusions.v1';

/**
 * Keywords que indican que un "producto" probablemente es un servicio /
 * adelanto / cargo administrativo y no debería entrar al cálculo de stock.
 */
const SERVICE_KEYWORDS = [
  // Servicios profesionales
  'servicio', 'service', 'consultoria', 'consultoría', 'asesoramiento', 'mantenimiento',
  // Adelantos y señas
  'seña', 'sena', 'seniado', 'señado', 'preventa', 'pre-venta', 'pre venta',
  'anticipo', 'adelanto', 'depósito', 'deposito',
  // Suscripciones / abonos
  'abono', 'suscripcion', 'suscripción', 'membresia', 'membresía', 'plan mensual',
  'plan anual', 'cuota', 'mensualidad',
  // Cargos / fees
  'cargo', 'fee', 'comision', 'comisión', 'flete', 'envio', 'envío', 'shipping',
  'instalacion', 'instalación', 'capacitacion', 'capacitación',
  // Reparaciones / mano de obra
  'mano de obra', 'reparacion', 'reparación', 'arreglo', 'service tecnico', 'service técnico',
];

/** Detecta si un nombre de producto es probablemente un servicio o no-stock.
 *  AUDIT FIX: usaba `.includes(kw)` que generaba falsos positivos:
 *    - "Servicio de mesa" (mantel) → matcheaba "servicio"
 *    - "Plan mensual de yerba" → matcheaba "plan mensual"
 *    - "Cargo de mate" → matcheaba "cargo"
 *  Ahora exigimos que el keyword aparezca como PALABRA ENTERA (con
 *  bordes de palabra), no como substring de otra palabra.
 */
export function looksLikeService(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return SERVICE_KEYWORDS.some(kw => {
    // Construimos un regex con \b a ambos lados. Escapamos caracteres
    // especiales del kw (ninguno tiene hoy, pero por las dudas) y
    // permitimos espacio interno como separador genérico.
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    return re.test(n);
  });
}

// ── Overrides manuales (localStorage) ───────────────────────────

interface StockExclusionStore {
  /** SKU/nombre normalizado → true si el usuario lo excluyó manualmente. */
  manualExcluded: Record<string, boolean>;
  /** SKU/nombre normalizado → true si el usuario forzó incluirlo (anula keyword auto). */
  manualIncluded: Record<string, boolean>;
}

const DEFAULT: StockExclusionStore = { manualExcluded: {}, manualIncluded: {} };
let cache: StockExclusionStore | null = null;
const subs = new Set<() => void>();

function read(): StockExclusionStore {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = { ...DEFAULT };
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULT };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<StockExclusionStore>;
    cache = {
      manualExcluded: parsed.manualExcluded || {},
      manualIncluded: parsed.manualIncluded || {},
    };
    return cache;
  } catch {
    cache = { ...DEFAULT };
    return cache;
  }
}

function write(next: StockExclusionStore) {
  cache = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // localStorage puede estar deshabilitado.
  }
  for (const fn of subs) fn();
}

function keyOf(name: string): string {
  return (name || '').trim().toLowerCase();
}

/**
 * Decide si un producto debe ser EXCLUIDO del cálculo de stock.
 *  - manualIncluded gana sobre todo (usuario forzó incluir).
 *  - manualExcluded segundo (usuario forzó excluir).
 *  - looksLikeService último (auto-detect).
 */
export function isExcludedFromStock(name: string): boolean {
  const k = keyOf(name);
  const store = read();
  if (store.manualIncluded[k]) return false;
  if (store.manualExcluded[k]) return true;
  return looksLikeService(name);
}

/** Estado para mostrar en UI: 'auto-service' / 'manual-excluded' / 'manual-included' / 'normal'. */
export type StockClassification = 'auto-service' | 'manual-excluded' | 'manual-included' | 'normal';

export function classifyProduct(name: string): StockClassification {
  const k = keyOf(name);
  const store = read();
  if (store.manualIncluded[k]) return 'manual-included';
  if (store.manualExcluded[k]) return 'manual-excluded';
  if (looksLikeService(name)) return 'auto-service';
  return 'normal';
}

/** Marca un producto como "no es stock físico" (excluir manualmente). */
export function markAsExcluded(name: string) {
  const k = keyOf(name);
  const cur = read();
  const next: StockExclusionStore = {
    manualExcluded: { ...cur.manualExcluded, [k]: true },
    manualIncluded: { ...cur.manualIncluded },
  };
  delete next.manualIncluded[k];
  write(next);
}

/** Fuerza incluir el producto en stock (anula auto-detect por keywords). */
export function markAsIncluded(name: string) {
  const k = keyOf(name);
  const cur = read();
  const next: StockExclusionStore = {
    manualExcluded: { ...cur.manualExcluded },
    manualIncluded: { ...cur.manualIncluded, [k]: true },
  };
  delete next.manualExcluded[k];
  write(next);
}

/** Limpia el override manual (vuelve a auto). */
export function clearOverride(name: string) {
  const k = keyOf(name);
  const cur = read();
  const next: StockExclusionStore = {
    manualExcluded: { ...cur.manualExcluded },
    manualIncluded: { ...cur.manualIncluded },
  };
  delete next.manualExcluded[k];
  delete next.manualIncluded[k];
  write(next);
}

/** Subscribe a cambios (UI puede re-renderizar). */
export function subscribeStockExclusions(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
