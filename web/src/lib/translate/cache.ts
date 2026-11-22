// Browser side: a small least-recently-used cache of machine results in localStorage, so looking
// up the same text again costs nothing (the free translation allowance is limited).
//
// Stored under banglalingo.translate.cache.v1 as { v: 1, e: [[key, value, savedAt], ...] }, oldest
// first. Every access is wrapped in try/catch: blocked or full storage just means no cache.

export const CACHE_KEY = "banglalingo.translate.cache.v1";
export const CACHE_MAX = 200;
/** Entries older than this are dropped when read. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedResult {
  text: string;
  /** Bengali script a romanized input was read as. */
  read?: string;
  /** Romanization of Bengali output, one entry per whitespace-separated word of `text`. */
  roman?: string[] | null;
}

type Entry = [string, CachedResult, number];

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Cache key: direction, input kind and the text with whitespace collapsed (Latin text lowercased). */
export function cacheKey(text: string, from: string, to: string, romanized: boolean): string {
  const t = text.normalize("NFC").trim().replace(/\s+/g, " ");
  const lowered = /[ঀ-৿]/.test(t) ? t : t.toLowerCase();
  return `${from}>${to}${romanized ? "r" : ""}|${lowered}`;
}

function valid(e: unknown): e is Entry {
  if (!Array.isArray(e) || e.length !== 3) return false;
  const [k, v, t] = e as unknown[];
  return typeof k === "string" && typeof t === "number" && !!v && typeof (v as CachedResult).text === "string";
}

function load(s: Storage, now: number): Entry[] {
  try {
    const raw = JSON.parse(s.getItem(CACHE_KEY) ?? "null") as { v?: number; e?: unknown } | null;
    if (!raw || raw.v !== 1 || !Array.isArray(raw.e)) return [];
    return raw.e.filter(valid).filter((e) => now - e[2] < CACHE_TTL_MS);
  } catch {
    return [];
  }
}

function save(s: Storage, entries: Entry[]) {
  const e = entries.slice(-CACHE_MAX);
  try {
    s.setItem(CACHE_KEY, JSON.stringify({ v: 1, e }));
  } catch {
    // Storage full: try again with half of it, then give up.
    try {
      s.setItem(CACHE_KEY, JSON.stringify({ v: 1, e: e.slice(-Math.floor(CACHE_MAX / 2)) }));
    } catch {
      // Nothing more to do; results just aren't kept.
    }
  }
}

/** The cached result for `key`, marked as most recently used, or null. */
export function cacheGet(key: string, now = Date.now()): CachedResult | null {
  try {
    const s = store();
    if (!s) return null;
    const entries = load(s, now);
    const i = entries.findIndex((e) => e[0] === key);
    if (i < 0) return null;
    const [hit] = entries.splice(i, 1);
    entries.push([hit[0], hit[1], now]);
    save(s, entries);
    return hit[1];
  } catch {
    return null;
  }
}

/** Remember a result; the least recently used entries beyond CACHE_MAX are dropped. */
export function cacheSet(key: string, value: CachedResult, now = Date.now()) {
  try {
    const s = store();
    if (!s) return;
    const entries = load(s, now).filter((e) => e[0] !== key);
    entries.push([key, value, now]);
    save(s, entries);
  } catch {
    // Ignore: the cache is only an optimisation.
  }
}

export function cacheClear() {
  try {
    store()?.removeItem(CACHE_KEY);
  } catch {
    // Ignore.
  }
}
