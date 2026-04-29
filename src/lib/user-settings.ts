/**
 * User-scoped UI preferences (Ola 7 / 2.7) + Auto-ajuste umbral por categoría (Ola 10).
 *
 * Persisted in localStorage so they don't require a Supabase migration or
 * a new column on company_settings.
 *
 * Available settings:
 *   - staleThresholdDays: override MANUAL del usuario (gana siempre).
 *   - hasManualOverride:  true cuando el usuario tocó el slider/input.
 *                         Si nunca lo tocó, usamos auto-ajuste según perfil.
 *
 * Auto-ajuste (Ola 10):
 *   - Si NO hay override manual, computeAutoStaleThreshold() infiere un
 *     default sensato según el perfil del negocio (companySettings) +
 *     la categoría que se está consultando.
 */

const STORAGE_KEY = 'wod.userSettings.v1';

export interface UserSettings {
  staleThresholdDays: number;
  /** true si el usuario movió el control en Configuración. */
  hasManualOverride: boolean;
}

const DEFAULTS: UserSettings = {
  staleThresholdDays: 30,
  hasManualOverride: false,
};

let cache: UserSettings | null = null;
const subs = new Set<(s: UserSettings) => void>();

function read(): UserSettings {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = { ...DEFAULTS };
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...DEFAULTS };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    cache = { ...DEFAULTS, ...parsed };
    if (!Number.isFinite(cache.staleThresholdDays) || cache.staleThresholdDays <= 0) {
      cache.staleThresholdDays = DEFAULTS.staleThresholdDays;
    }
    return cache;
  } catch {
    cache = { ...DEFAULTS };
    return cache;
  }
}

function write(next: UserSettings) {
  cache = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // localStorage puede estar deshabilitado (modo incógnito, cuota); no-op.
  }
  for (const fn of subs) fn(next);
}

export function getUserSettings(): UserSettings {
  return read();
}

export function setUserSettings(patch: Partial<UserSettings>) {
  const current = read();
  const next: UserSettings = { ...current, ...patch };
  if (!Number.isFinite(next.staleThresholdDays) || next.staleThresholdDays <= 0) {
    next.staleThresholdDays = DEFAULTS.staleThresholdDays;
  }
  // Cualquier escritura del staleThresholdDays implica override manual,
  // salvo que el llamador explícitamente diga lo contrario.
  if (patch.staleThresholdDays !== undefined && patch.hasManualOverride === undefined) {
    next.hasManualOverride = true;
  }
  write(next);
}

/** Reset al modo "auto" (limpia override manual). */
export function clearManualOverride() {
  setUserSettings({ staleThresholdDays: DEFAULTS.staleThresholdDays, hasManualOverride: false });
}

// ── Auto-ajuste (Ola 10) ────────────────────────────────────────

/** Perfil mínimo del negocio para inferir umbral. */
export interface AutoThresholdContext {
  has_stock?: boolean | null;
  sells_products?: boolean | null;
  sells_services?: boolean | null;
  has_recurring_clients?: boolean | null;
  uses_meta_ads?: boolean | null;
  uses_google_ads?: boolean | null;
}

/**
 * Devuelve días por categoría según perfil del negocio.
 * Categorías reconocidas: ventas, stock, gastos, marketing, clientes, otros.
 */
export function computeAutoStaleThreshold(
  category: string | undefined,
  ctx: AutoThresholdContext | null | undefined,
): number {
  const cat = (category || '').toLowerCase();
  const hasStock = !!ctx?.has_stock;
  const sellsProducts = !!ctx?.sells_products;
  const sellsServices = !!ctx?.sells_services;
  const isRecurring = !!ctx?.has_recurring_clients;
  const usesAds = !!ctx?.uses_meta_ads || !!ctx?.uses_google_ads;

  // Marketing siempre debería ser fresco si hay campañas activas.
  if (cat === 'marketing' && usesAds) return 7;

  // Stock: si maneja inventario físico, frescura crítica.
  if (cat === 'stock' && hasStock) return 7;

  // Ventas: depende del modelo de negocio.
  if (cat === 'ventas') {
    if (hasStock && sellsProducts) return 7;          // retail/e-commerce con stock
    if (sellsProducts && !sellsServices) return 14;   // sólo productos sin stock
    if (sellsServices && isRecurring) return 30;      // SaaS / recurring
    if (sellsServices) return 21;                     // consultoría / proyectos
    return 14;                                         // mixto
  }

  // Gastos / facturas: mensuales en general.
  if (cat === 'gastos' || cat === 'facturas') return 30;

  // Clientes (CRM): suele actualizarse semanal en empresas activas.
  if (cat === 'clientes') return 14;

  // Default global: 30 días.
  return 30;
}

/**
 * API pública: devuelve el umbral efectivo en días para una categoría.
 *  - Si el usuario tiene override manual → ése gana siempre.
 *  - Si no, usa computeAutoStaleThreshold(category, companySettings).
 *  - Si no se pasa context, fallback al storage (compat con código existente).
 */
export function getStaleThresholdDays(
  category?: string,
  companySettings?: AutoThresholdContext | null,
): number {
  const s = read();
  if (s.hasManualOverride) return s.staleThresholdDays;
  if (companySettings) return computeAutoStaleThreshold(category, companySettings);
  // Sin context disponible → fallback al storage (default 30).
  return s.staleThresholdDays;
}

export function subscribeUserSettings(fn: (s: UserSettings) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
