import { emptyStore } from "./engine";
import type { FormalityStore } from "./types";

export const FORMALITY_KEY = "banglalingo.formality.v1";

/** Tolerant parse: anything unexpected falls back to a fresh store. */
export function parseStore(raw: string | null | undefined): FormalityStore {
  if (!raw) return emptyStore();
  try {
    const x = JSON.parse(raw) as Partial<FormalityStore> | null;
    if (!x || typeof x !== "object" || x.v !== 1) return emptyStore();
    const best: Record<string, number> = {};
    if (x.best && typeof x.best === "object") {
      for (const [k, v] of Object.entries(x.best)) if (/^\d+$/.test(k) && Number.isFinite(v) && v >= 0) best[k] = Math.floor(v);
    }
    const unlocked = Number.isInteger(x.unlocked) && (x.unlocked as number) >= 1 ? (x.unlocked as number) : 1;
    const rounds = Number.isInteger(x.rounds) && (x.rounds as number) >= 0 ? (x.rounds as number) : 0;
    return { v: 1, unlocked, best, rounds };
  } catch {
    return emptyStore();
  }
}

export function readStore(): FormalityStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    return parseStore(window.localStorage.getItem(FORMALITY_KEY));
  } catch {
    return emptyStore();
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: same-tab writes and cross-tab `storage` events. */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FORMALITY_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Raw stored string (a stable snapshot); null on the server or when unreadable. */
export function readStoreRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(FORMALITY_KEY);
  } catch {
    return null;
  }
}

export function writeStore(store: FormalityStore): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(FORMALITY_KEY, JSON.stringify(store));
    listeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}
