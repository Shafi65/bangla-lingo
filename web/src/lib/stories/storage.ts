// Story completion, kept in localStorage under banglalingo.stories.v1. Separate from lesson progress:
// stories never change XP, the streak or the daily goal. Every access is wrapped in try/catch.
import { useMemo, useSyncExternalStore } from "react";

export const STORIES_KEY = "banglalingo.stories.v1";

export interface StoryRecord {
  /** Best score (correct first answers). */
  best: number;
  /** Score of the latest read. */
  last: number;
  /** Questions in the story when it was last read. */
  total: number;
  /** How many times it was finished. */
  times: number;
  /** ISO time of the latest finish. */
  at: string;
}

export interface StoriesStore {
  v: 1;
  done: Record<string, StoryRecord>;
}

export const emptyStories = (): StoriesStore => ({ v: 1, done: {} });

const nat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Tolerant parse: anything unexpected is dropped; a broken value yields an empty store. */
export function parseStories(raw: string | null | undefined): StoriesStore {
  if (!raw) return emptyStories();
  try {
    const x = JSON.parse(raw) as { v?: unknown; done?: unknown } | null;
    if (!x || typeof x !== "object" || x.v !== 1 || !x.done || typeof x.done !== "object") return emptyStories();
    const done: Record<string, StoryRecord> = {};
    for (const [id, r] of Object.entries(x.done as Record<string, Partial<StoryRecord>>)) {
      if (!r || !nat(r.best) || !nat(r.last) || !nat(r.total) || typeof r.at !== "string") continue;
      done[id] = { best: r.best, last: r.last, total: r.total, times: nat(r.times) && r.times > 0 ? r.times : 1, at: r.at };
    }
    return { v: 1, done };
  } catch {
    return emptyStories();
  }
}

/** Record a finished read; returns the new store (pure). */
export function recordFinish(store: StoriesStore, id: string, score: number, total: number, now = new Date()): StoriesStore {
  const prev = store.done[id];
  return {
    v: 1,
    done: {
      ...store.done,
      [id]: { best: Math.max(prev?.best ?? 0, score), last: score, total, times: (prev?.times ?? 0) + 1, at: now.toISOString() },
    },
  };
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORIES_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORIES_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readStories(): StoriesStore {
  return parseStories(readRaw());
}

export function writeStories(store: StoriesStore): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORIES_KEY, JSON.stringify(store));
    listeners.forEach((l) => l());
    return true;
  } catch {
    return false;
  }
}

/** Reactive story completion; an empty store (ready: false) on the server and first render. */
export function useStories(): { store: StoriesStore; ready: boolean } {
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);
  return useMemo(() => ({ store: parseStories(raw ?? null), ready: raw !== undefined }), [raw]);
}
