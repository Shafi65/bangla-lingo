// Client-side store for the reviewer state: loads localStorage lazily, saves on every change, syncs across tabs.
// Safe to import on the server (it only touches storage in the browser).
import { useSyncExternalStore } from "react";
import { emptyState, loadState, saveState, STORAGE_KEY, type ReviewState } from "./storage";

const SERVER_STATE = emptyState();
let state: ReviewState = SERVER_STATE;
let loaded = false;
let saveFailed = false;
const listeners = new Set<() => void>();
let attached = false;

function ensure() {
  if (!loaded && typeof window !== "undefined") {
    state = loadState();
    loaded = true;
  }
}
const notify = () => listeners.forEach((l) => l());

function onStorage(e: StorageEvent) {
  if (e.key === STORAGE_KEY || e.key === null) {
    state = loadState();
    loaded = true;
    notify();
  }
}

export const reviewStore = {
  get(): ReviewState {
    ensure();
    return state;
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    if (!attached && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      attached = true;
    }
    return () => listeners.delete(l);
  },
  update(fn: (s: ReviewState) => ReviewState) {
    ensure();
    const next = fn(state);
    if (next === state) return;
    state = next;
    saveFailed = !saveState(state);
    notify();
  },
  saveFailed: () => saveFailed,
};

/** The reviewer state (empty on the server and during hydration, then the saved one). */
export function useReviewState(): ReviewState {
  return useSyncExternalStore(reviewStore.subscribe, reviewStore.get, () => SERVER_STATE);
}

/** True when the browser refused the last save (storage full or blocked): the work only lives in this tab. */
export function useSaveFailed(): boolean {
  return useSyncExternalStore(reviewStore.subscribe, reviewStore.saveFailed, () => false);
}

import { updateItem, updateOverall, type Verdict } from "./storage";
import type { Target } from "./targets";

/** Sets (never toggles) an item's verdict, re-baselining its content hash. */
export function setVerdict(lessonId: string, target: Target, verdict: Verdict | undefined) {
  reviewStore.update((s) =>
    updateItem(s, lessonId, target.key, { hash: target.hash, text: target.text, seq: target.seq }, { verdict }),
  );
}

export function setItemField(lessonId: string, target: Target, field: "comment" | "correction", value: string) {
  reviewStore.update((s) =>
    updateItem(s, lessonId, target.key, { hash: target.hash, text: target.text, seq: target.seq }, { [field]: value }),
  );
}

export function setOverall(lessonId: string, patch: { rating?: number | undefined; comment?: string }) {
  reviewStore.update((s) => updateOverall(s, lessonId, patch));
}
