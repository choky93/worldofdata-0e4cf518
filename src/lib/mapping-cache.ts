/**
 * Wave C.3: client-side mapping cache.
 *
 * Hashes the file headers (sorted, lowercase, joined) and stores the
 * resulting AI classification + mapping in localStorage. On the next
 * upload of a file with the same header signature we can reuse the
 * cached mapping and skip the AI classification call.
 *
 * Constraints:
 *   - TTL: 30 days. Stale entries are evicted on read.
 *   - Cap: 50 entries (LRU by `lastUsed`). Oldest evicted on insert.
 *   - Stored under a single localStorage key as a JSON object so we can
 *     do one read/write per access (cheap).
 */

const STORAGE_KEY = 'wod.mapping_cache.v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 50;

export interface CachedMapping {
  category: string;
  summary: string;
  column_mapping: Record<string, string | null>;
  /** Original header signature this entry was saved under (for debugging). */
  headerSig: string;
  cachedAt: number;
  lastUsed: number;
}

type Store = Record<string, CachedMapping>;

async function sha256Hex(s: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback: very small djb2 hash. Not collision-proof but good enough
    // for environments without WebCrypto (rare).
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashHeaders(headers: string[]): Promise<string> {
  const norm = headers
    .map(h => (h ?? '').toString().trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
  return sha256Hex(norm);
}

function readStore(): Store {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Store : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // Quota exceeded or storage disabled — silently ignore. The cache is a
    // pure optimisation, never load-bearing.
  }
}

function evictExpired(store: Store): Store {
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (now - entry.cachedAt > TTL_MS) {
      delete store[key];
      changed = true;
    }
  }
  return changed ? { ...store } : store;
}

function evictToCap(store: Store): Store {
  const entries = Object.entries(store);
  if (entries.length <= MAX_ENTRIES) return store;
  // Sort by lastUsed ascending → oldest first → drop the front.
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const toRemove = entries.length - MAX_ENTRIES;
  for (let i = 0; i < toRemove; i++) delete store[entries[i][0]];
  return { ...store };
}

export async function getCachedMapping(headers: string[]): Promise<CachedMapping | null> {
  const key = await hashHeaders(headers);
  let store = readStore();
  store = evictExpired(store);
  const entry = store[key];
  if (!entry) {
    writeStore(store);
    return null;
  }
  // Touch lastUsed so this entry survives LRU pruning.
  entry.lastUsed = Date.now();
  store[key] = entry;
  writeStore(store);
  return entry;
}

export async function putCachedMapping(
  headers: string[],
  payload: { category: string; summary: string; column_mapping: Record<string, string | null> },
): Promise<void> {
  const key = await hashHeaders(headers);
  const sig = headers.map(h => (h ?? '').toString().trim().toLowerCase()).filter(Boolean).sort().join('|');
  let store = readStore();
  store = evictExpired(store);
  store[key] = {
    category: payload.category,
    summary: payload.summary,
    column_mapping: payload.column_mapping,
    headerSig: sig,
    cachedAt: Date.now(),
    lastUsed: Date.now(),
  };
  store = evictToCap(store);
  writeStore(store);
}

export function clearMappingCache(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
