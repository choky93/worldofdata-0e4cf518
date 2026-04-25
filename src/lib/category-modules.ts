/**
 * Central category → modules mapping (Ola 7 / 2.6).
 *
 * Single source of truth for "which dashboard modules consume which data
 * category". Used by:
 *   - File detail UI in CargaDatos.tsx (which sections will get the data)
 *   - Click-through lineage on the Dashboard (KPI → originating category → file list)
 *   - Freshness pills (per-module freshness driven by the categories that feed it)
 *
 * Keep this in sync with the routes in src/App.tsx and the per-page
 * `useExtractedData()` consumers.
 */

export type CategoryKey =
  | 'ventas'
  | 'gastos'
  | 'stock'
  | 'marketing'
  | 'clientes'
  | 'facturas'
  | 'rrhh'
  | 'otro';

/** Stable identifiers for dashboard modules. */
export type ModuleKey =
  | 'dashboard'
  | 'ventas'
  | 'forecast'
  | 'alertas'
  | 'flujo'
  | 'stock'
  | 'marketing'
  | 'clientes'
  | 'finanzas'
  | 'rrhh'
  | 'otro';

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  /** Route path; null if the module has no dedicated page yet. */
  path: string | null;
}

export const MODULES: Record<ModuleKey, ModuleInfo> = {
  dashboard: { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  ventas:    { key: 'ventas',    label: 'Ventas',    path: '/ventas' },
  forecast:  { key: 'forecast',  label: 'Forecast',  path: '/forecast' },
  alertas:   { key: 'alertas',   label: 'Alertas',   path: '/alertas' },
  flujo:     { key: 'flujo',     label: 'Flujo de caja', path: '/finanzas' },
  stock:     { key: 'stock',     label: 'Stock',     path: '/stock' },
  marketing: { key: 'marketing', label: 'Marketing', path: '/marketing' },
  clientes:  { key: 'clientes',  label: 'Clientes',  path: '/clientes' },
  finanzas:  { key: 'finanzas',  label: 'Finanzas',  path: '/finanzas' },
  rrhh:      { key: 'rrhh',      label: 'RRHH',      path: null },
  otro:      { key: 'otro',      label: 'Otro',      path: null },
};

/** category → modules that consume it */
export const CATEGORY_MODULES: Record<CategoryKey, ModuleKey[]> = {
  ventas:    ['dashboard', 'ventas', 'forecast', 'alertas'],
  gastos:    ['dashboard', 'flujo', 'alertas'],
  stock:     ['dashboard', 'stock', 'alertas'],
  marketing: ['dashboard', 'marketing'],
  clientes:  ['clientes'],
  facturas:  ['finanzas'],
  rrhh:      ['rrhh'],
  otro:      ['otro'],
};

/** Inverse: module → categories that feed it. Computed lazily once. */
let _moduleCategories: Record<ModuleKey, CategoryKey[]> | null = null;
export function moduleCategories(): Record<ModuleKey, CategoryKey[]> {
  if (_moduleCategories) return _moduleCategories;
  const out = {} as Record<ModuleKey, CategoryKey[]>;
  for (const m of Object.keys(MODULES) as ModuleKey[]) out[m] = [];
  for (const [cat, mods] of Object.entries(CATEGORY_MODULES) as [CategoryKey, ModuleKey[]][]) {
    for (const m of mods) out[m].push(cat);
  }
  _moduleCategories = out;
  return out;
}

/** Categories that feed a given module (e.g., dashboard ← ventas+gastos+stock+marketing). */
export function categoriesForModule(module: ModuleKey): CategoryKey[] {
  return moduleCategories()[module] ?? [];
}

/** Module labels for a category, used in UI badges. */
export function moduleLabelsForCategory(cat: string): string[] {
  const mods = CATEGORY_MODULES[cat as CategoryKey];
  if (!mods) return [];
  return mods.map(m => MODULES[m].label);
}

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ventas: 'Ventas',
  gastos: 'Gastos',
  stock: 'Stock',
  marketing: 'Marketing',
  clientes: 'Clientes',
  facturas: 'Facturas',
  rrhh: 'RRHH',
  otro: 'Otro',
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat as CategoryKey] ?? cat;
}
