// Per-word memory (spaced review). Owned by the smart-review workstream.
//
// The lesson player calls recordExerciseResult after every checked answer.
// Mapping an exercise to the words it tests needs the course's bn -> id index
// (lib/review/targets.ts). Pages that already have it call provideWordIndex();
// otherwise it is fetched once from /practice/word-index.json (a static file
// generated at build time). Until it arrives, answers wait in
// `memory.pending` (persisted), and are replayed in order.
import { progressStore, type ProgressState, type ProgressStore } from "./progress";
import { applyGrades, seedFromCompleted, type PendingEvent, type WordMemoryState } from "./review/state";
import { gradesFor, resolveIndex, reviewWordId, targetsFor, type ResolvedIndex, type WordIndex } from "./review/targets";
import type { Exercise } from "./types";

export const WORD_INDEX_URL = "/practice/word-index.json";

let resolved: { raw: WordIndex; idx: ResolvedIndex } | undefined;
let loading: Promise<void> | undefined;
let store: ProgressStore = progressStore;

/** For tests / alternative backends. */
export function setMemoryStore(s: ProgressStore): void {
  store = s;
}

/** Keep only what targetsFor needs, so pending events stay small. */
function trimExercise(ex: Exercise): Partial<Exercise> {
  const out: Record<string, unknown> = { id: ex.id, type: ex.type };
  if ("prompt" in ex && ex.prompt) out.prompt = { bn: ex.prompt.bn };
  if (ex.type === "listen_select" && ex.audio) out.audio = { bn: ex.audio.bn };
  if (ex.type === "match_pairs" && Array.isArray(ex.pairs)) out.pairs = ex.pairs.map((p) => ({ bn: p?.bn }));
  if (ex.type === "script_recognize") out.glyph = ex.glyph;
  return out as Partial<Exercise>;
}

function applyEvent(s: WordMemoryState, idx: ResolvedIndex, e: PendingEvent): WordMemoryState {
  const targets = targetsFor(idx, e.l, e.x as Exercise);
  return applyGrades(s, gradesFor(targets, e.ok), e.t);
}

/**
 * Replay pending answers and seed records for completed lessons (migration for
 * data saved before word memory existed). Safe to call often; no-op when
 * there is nothing to do.
 */
export function syncWordMemory(progress: ProgressState = store.get()): void {
  if (typeof window === "undefined" || !resolved) return;
  const { raw, idx } = resolved;
  store.updateWordMemory((prev) => {
    let next = prev;
    if (prev.pending.length) {
      next = { ...prev, pending: [] };
      for (const e of [...prev.pending].sort((a, b) => a.t - b.t)) next = applyEvent(next, idx, e);
    }
    return seedFromCompleted(next, progress.completed, raw.lessons);
  });
}

/** Hand over the index directly (pages that ship it in their props). */
export function provideWordIndex(index: WordIndex): void {
  if (!resolved || resolved.raw !== index) resolved = { raw: index, idx: resolveIndex(index) };
  syncWordMemory();
}

/** Fetch the index once (browser only). Resolves when it is ready or failed. */
export function loadWordIndex(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (resolved) return Promise.resolve();
  loading ??= fetch(WORD_INDEX_URL)
    .then((r) => (r.ok ? (r.json() as Promise<WordIndex>) : Promise.reject(new Error(String(r.status)))))
    .then((index) => {
      if (!index || !Array.isArray(index.entries)) throw new Error("bad index");
      if (!resolved) provideWordIndex(index);
    })
    .catch(() => {
      loading = undefined; // retry on the next answer / page visit; pending events are kept
    });
  return loading;
}

export function hasWordIndex(): boolean {
  return !!resolved;
}

/** Record one checked answer. Must be cheap, synchronous and safe during SSR (no-op on the server). */
export function recordExerciseResult(lessonId: string, exercise: Exercise, correct: boolean): void {
  if (typeof window === "undefined" || !exercise || typeof exercise !== "object") return;
  try {
    const t = Date.now();
    const e: PendingEvent = { l: String(lessonId), x: trimExercise(exercise), ok: !!correct, t };
    // Generated review items name their word: no index needed.
    if (resolved || reviewWordId(String(exercise.id ?? ""))) {
      const idx = resolved?.idx ?? resolveIndex({ entries: [], lessons: {} });
      store.updateWordMemory((s) => applyEvent(s, idx, e));
      return;
    }
    store.updateWordMemory((s) => ({ ...s, pending: [...s.pending, e].slice(-300) }));
    void loadWordIndex();
  } catch {
    // never break the lesson over bookkeeping
  }
}
