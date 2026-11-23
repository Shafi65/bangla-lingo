"use client";

import { useSyncExternalStore } from "react";

// Handwriting progress, kept apart from lesson progress (XP, streak). Best state per letter:
// "traced" (passed the trace step) < "written" (passed writing from memory).

export const WRITE_KEY = "banglalingo.write.v1";

export type WriteState = "new" | "traced" | "written";
export interface WriteProgress {
  version: 1;
  letters: Record<string, "traced" | "written">;
}

const EMPTY: WriteProgress = Object.freeze({ version: 1, letters: Object.freeze({}) }) as WriteProgress;
const RANK: Record<WriteState, number> = { new: 0, traced: 1, written: 2 };

export function sanitize(raw: unknown): WriteProgress {
  const letters: WriteProgress["letters"] = {};
  const src = (raw as { letters?: unknown } | null)?.letters;
  if (src && typeof src === "object") {
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      if (v === "traced" || v === "written") letters[id] = v;
    }
  }
  return { version: 1, letters };
}

/** Records a better state; never downgrades. Returns the same object when nothing changes. */
export function withState(p: WriteProgress, id: string, state: "traced" | "written"): WriteProgress {
  if (RANK[p.letters[id] ?? "new"] >= RANK[state]) return p;
  return { version: 1, letters: { ...p.letters, [id]: state } };
}

function read(): WriteProgress {
  try {
    const s = window.localStorage.getItem(WRITE_KEY);
    return s ? sanitize(JSON.parse(s)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

let snapshot: WriteProgress | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): WriteProgress {
  return (snapshot ??= read());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === WRITE_KEY || e.key === null) {
      snapshot = read();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function recordWrite(id: string, state: "traced" | "written") {
  const cur = getSnapshot();
  const next = withState(cur, id, state);
  if (next === cur) return;
  snapshot = next;
  try {
    window.localStorage.setItem(WRITE_KEY, JSON.stringify(next));
  } catch {
    // storage blocked or full: progress stays in memory for this visit
  }
  listeners.forEach((l) => l());
}

/** Current handwriting progress (account sync). */
export function readWriteProgress(): WriteProgress {
  return getSnapshot();
}

/** Replace handwriting progress wholesale (account sync); notifies subscribers. */
export function replaceWriteProgress(next: WriteProgress) {
  snapshot = sanitize(next);
  try {
    window.localStorage.setItem(WRITE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage blocked or full: progress stays in memory for this visit
  }
  listeners.forEach((l) => l());
}

export { subscribe as subscribeWrite };

export function useWriteProgress(): WriteProgress {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
