// Light per-item self-rating history, kept on this device only (localStorage). Separate from
// progress/XP/streak on purpose: rating yourself never earns anything.
import { useSyncExternalStore } from "react";

export const SPEAK_KEY = "banglalingo.speak.v1";
/** 0 = Again, 1 = Close, 2 = Nailed it. */
export type Rating = 0 | 1 | 2;
export const RATING_LABELS = ["Again", "Close", "Nailed it"] as const;

export interface ItemHistory {
  /** Times rated. */
  n: number;
  /** Most recent rating. */
  last: Rating;
  /** Epoch ms of the most recent rating. */
  at: number;
  /** The last few ratings, oldest first. */
  recent: Rating[];
}
export type SpeakHistory = Record<string, ItemHistory>;

const KEEP = 5;
const MAX_ITEMS = 2000;
const isRating = (v: unknown): v is Rating => v === 0 || v === 1 || v === 2;

/** Tolerant parse of the stored blob; anything malformed is dropped. */
export function parseHistory(raw: string | null): SpeakHistory {
  if (!raw) return {};
  try {
    const items = (JSON.parse(raw) as { items?: unknown })?.items;
    const out: SpeakHistory = {};
    if (!items || typeof items !== "object") return out;
    for (const [k, v] of Object.entries(items as Record<string, Partial<ItemHistory> | null>)) {
      if (!v || typeof v !== "object" || !isRating(v.last)) continue;
      const recent = Array.isArray(v.recent) ? v.recent.filter(isRating).slice(-KEEP) : [v.last];
      out[k] = {
        n: Number.isFinite(v.n) && (v.n as number) > 0 ? Math.floor(v.n as number) : recent.length || 1,
        last: v.last,
        at: Number.isFinite(v.at) ? (v.at as number) : 0,
        recent: recent.length ? recent : [v.last],
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** New history with `rating` added for `key` (pure). */
export function withRating(h: SpeakHistory, key: string, rating: Rating, at: number): SpeakHistory {
  const prev = h[key];
  const next: SpeakHistory = {
    ...h,
    [key]: {
      n: (prev?.n ?? 0) + 1,
      last: rating,
      at,
      recent: [...(prev?.recent ?? []), rating].slice(-KEEP),
    },
  };
  const keys = Object.keys(next);
  if (keys.length > MAX_ITEMS) {
    keys
      .sort((a, b) => next[a].at - next[b].at)
      .slice(0, keys.length - MAX_ITEMS)
      .forEach((k) => delete next[k]);
  }
  return next;
}

// --- store -----------------------------------------------------------------

let memoryRaw: string | null = null; // used when localStorage is unavailable
const listeners = new Set<() => void>();

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SPEAK_KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

/** Records a rating and notifies subscribers. Never throws. */
export function recordRating(key: string, rating: Rating): void {
  const next = JSON.stringify({ v: 1, items: withRating(parseHistory(readRaw()), key, rating, Date.now()) });
  memoryRaw = next;
  try {
    window.localStorage.setItem(SPEAK_KEY, next);
  } catch {
    // storage full or blocked: keep it for this visit only
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SPEAK_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Parsed history; stable between changes (cached by the raw string). */
let cacheRaw: string | null | undefined;
let cacheVal: SpeakHistory = {};
function snapshot(): SpeakHistory {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheVal = parseHistory(raw);
  }
  return cacheVal;
}
const EMPTY: SpeakHistory = {};

export function useSpeakHistory(): SpeakHistory {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
