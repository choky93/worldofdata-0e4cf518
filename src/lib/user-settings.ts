/**
 * User-scoped UI preferences (Ola 7 / 2.7).
 *
 * Persisted in localStorage so they don't require a Supabase migration or
 * a new column on company_settings. These are individual UX preferences,
 * not company config — keeping them client-side is the right grain.
 *
 * Available settings:
 *   - staleThresholdDays: how many days until data is "stale" (default 30)
 */

const STORAGE_KEY = 'wod.userSettings.v1';

export interface UserSettings {
  staleThresholdDays: number;
}

const DEFAULTS: UserSettings = {
  staleThresholdDays: 30,
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
    // Sanitize
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
    // localStorage may be unavailable (private mode, quota); silently no-op.
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
  write(next);
}

export function getStaleThresholdDays(): number {
  return read().staleThresholdDays;
}

export function subscribeUserSettings(fn: (s: UserSettings) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
