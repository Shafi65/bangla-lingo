// Browser side of the Translate page: the machine-translation request and recent lookups.
import { cacheGet, cacheKey, cacheSet } from "./cache";
import { QUOTA_MESSAGE, type HealthResponse, type Lang, type MachineResponse } from "./types";

export type MachineState =
  | { s: "idle" }
  | { s: "loading" }
  | {
      s: "done";
      text: string;
      from: Lang;
      to: Lang;
      source: string;
      /** Romanized input: the Bengali script it was read as. */
      read?: string;
      /** Bengali output: approximate romanization from the translator, one entry per word. */
      roman?: string[] | null;
      /** Came from this device's cache (no request was made). */
      cached?: boolean;
    }
  | { s: "unconfigured" }
  | { s: "offline" }
  | { s: "error"; message: string; quota?: boolean };

export interface MachineOptions {
  /** The text is Bengali typed with Roman letters (from must be "bn", to "en"). */
  romanized?: boolean;
  signal?: AbortSignal;
}

const GENERIC = "Translation isn't available right now. Course words still work.";

/** Ask the server to translate `text` (or answer from this device's cache). Never throws. */
export async function requestMachine(text: string, from: Lang, to: Lang, opts: MachineOptions = {}): Promise<MachineState> {
  const { signal } = opts;
  const romanized = !!opts.romanized && from === "bn" && to === "en";
  const ckey = cacheKey(text, from, to, romanized);
  const hit = cacheGet(ckey);
  if (hit) {
    return { s: "done", text: hit.text, from, to, source: text, read: hit.read, roman: hit.roman ?? null, cached: true };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { s: "offline" };
  try {
    const res = await fetch("/translate/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from, to, ...(romanized ? { romanized: true } : {}) }),
      cache: "no-store",
      signal,
    });
    const body = (await res.json().catch(() => null)) as MachineResponse | null;
    if (body && body.ok) {
      const roman = Array.isArray(body.roman) ? body.roman : null;
      cacheSet(ckey, { text: body.text, ...(body.read ? { read: body.read } : {}), roman });
      return { s: "done", text: body.text, from: body.from, to: body.to, source: text, read: body.read, roman };
    }
    if (body && "configured" in body && body.configured === false) return { s: "unconfigured" };
    if (body && "quota" in body && body.quota) return { s: "error", message: body.error || QUOTA_MESSAGE, quota: true };
    if (body && "error" in body && typeof body.error === "string") return { s: "error", message: body.error };
    return { s: "error", message: GENERIC };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return { s: "idle" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { s: "offline" };
    return { s: "error", message: "Couldn't reach the translator. Check your connection and try again." };
  }
}

/** Is machine translation set up on the server? Asks the health endpoint (which never calls Azure). null = unknown. */
export async function fetchConfigured(signal?: AbortSignal): Promise<boolean | null> {
  try {
    const res = await fetch("/translate/api?health=1", { cache: "no-store", signal });
    const body = (await res.json().catch(() => null)) as HealthResponse | null;
    return body && typeof body.configured === "boolean" ? body.configured : null;
  } catch {
    return null;
  }
}

// --- recent lookups -----------------------------------------------------------------------

export const RECENT_KEY = "bl-translate-recent-v1";
export const RECENT_MAX = 10;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(storage()?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Puts `text` first (case-insensitive de-duplication) and keeps the last RECENT_MAX. */
export function pushRecent(list: readonly string[], text: string): string[] {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return [...list];
  const key = t.normalize("NFC").toLowerCase();
  return [t, ...list.filter((x) => x.normalize("NFC").toLowerCase() !== key)].slice(0, RECENT_MAX);
}

export function saveRecent(list: readonly string[]) {
  try {
    const s = storage();
    if (!s) return;
    if (list.length === 0) s.removeItem(RECENT_KEY);
    else s.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Storage full or blocked: recent lookups just aren't kept.
  }
}

// A tiny external store so React reads recent lookups without a hydration mismatch.
const EMPTY: readonly string[] = Object.freeze([]);
let snapshot: readonly string[] | null = null;
const listeners = new Set<() => void>();

export const recentStore = {
  get(): readonly string[] {
    return (snapshot ??= loadRecent());
  },
  server(): readonly string[] {
    return EMPTY;
  },
  set(list: readonly string[]) {
    snapshot = list.slice(0, RECENT_MAX);
    saveRecent(snapshot);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
