/**
 * Marketing campaign overrides (Ola 22).
 *
 * Cuando el sistema no detecta el objetivo de una campaña (porque el export
 * no lo trae y el nombre no permite inferirlo), el usuario puede asignarlo
 * manualmente. Persistido en localStorage por navegador.
 *
 * Ejemplo del feedback de Lucas: "tengo una que dice 'campaña a todo el país,
 * número admin' pero no hace ninguna referencia a qué tipo de campaña es. Yo
 * sé que es una campaña de mensajes, entonces lo podría agregar".
 */

const STORAGE_KEY = 'wod.marketingOverrides.v1';

interface Store {
  /** nombre normalizado de campaña → objetivo override */
  objectiveByCampaign: Record<string, string>;
}

const DEFAULT: Store = { objectiveByCampaign: {} };

let cache: Store | null = null;
const subs = new Set<() => void>();

function read(): Store {
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
    const parsed = JSON.parse(raw) as Partial<Store>;
    cache = { objectiveByCampaign: parsed.objectiveByCampaign || {} };
    return cache;
  } catch {
    cache = { ...DEFAULT };
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
    // localStorage may be unavailable; silently no-op.
  }
  for (const fn of subs) fn();
}

function key(name: string): string {
  return (name || '').trim().toLowerCase();
}

export function getObjectiveOverride(campaignName: string): string | undefined {
  return read().objectiveByCampaign[key(campaignName)];
}

export function setObjectiveOverride(campaignName: string, objective: string | null) {
  const k = key(campaignName);
  if (!k) return;
  const cur = read();
  const next: Store = {
    objectiveByCampaign: { ...cur.objectiveByCampaign },
  };
  if (objective) next.objectiveByCampaign[k] = objective;
  else delete next.objectiveByCampaign[k];
  write(next);
}

export function subscribeMarketingOverrides(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

// AUDIT FIX: multi-tab sync. Si el usuario asigna un objetivo manual a
// una campaña en otra pestaña, esta refresca solo.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    for (const fn of subs) fn();
  });
}

/** Lista cerrada de objetivos que se pueden asignar manualmente. */
export const OBJECTIVE_OPTIONS = [
  'Mensajes',
  'Conversiones',
  'Tráfico',
  'Leads',
  'Alcance/Branding',
  'Interacción',
  'Reproducciones',
  'Catálogo',
] as const;
