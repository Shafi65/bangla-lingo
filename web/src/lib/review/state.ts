// Word-memory state: shape, safe parsing, and pure updates. No React/DOM.
//
// Stored (localStorage key "banglalingo.memory.v1") as
//   {
//     version: 1,
//     words:   { [lexiconId]: WordRecord },   // see scheduler.ts
//     pending: PendingEvent[]                 // answers not yet mapped to word ids
//   }
// `pending` exists because the lesson player records answers before the word
// index (bn -> id) has been fetched; events are replayed in order once it is.
import type { LessonRecord } from "../progress";
import { DAY_MS, intervalDays, sanitizeRecord, schedule, type Grade, type WordRecord } from "./scheduler";

export interface PendingEvent {
  /** lesson id */
  l: string;
  /** exercise, trimmed to the fields targetsFor needs */
  x: unknown;
  ok: boolean;
  /** epoch ms */
  t: number;
}

export interface WordMemoryState {
  version: 1;
  words: Record<string, WordRecord>;
  pending: PendingEvent[];
}

export const EMPTY_MEMORY: WordMemoryState = Object.freeze({
  version: 1,
  words: Object.freeze({}) as Record<string, WordRecord>,
  pending: Object.freeze([]) as unknown as PendingEvent[],
}) as WordMemoryState;

/** Storage caps: the lexicon has well under this many words. */
export const MAX_WORDS = 4000;
export const MAX_PENDING = 300;

/** Parse anything (string, object, junk) into a valid state. Never throws. */
export function parseMemory(raw: unknown): WordMemoryState {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return EMPTY_MEMORY;
    }
  }
  if (!v || typeof v !== "object") return EMPTY_MEMORY;
  const o = v as { version?: unknown; words?: unknown; pending?: unknown };
  if (o.version !== 1) return EMPTY_MEMORY; // future versions: migrate here
  const words: Record<string, WordRecord> = {};
  if (o.words && typeof o.words === "object") {
    for (const [id, r] of Object.entries(o.words as Record<string, unknown>)) {
      const rec = sanitizeRecord(r, id);
      if (rec) words[id] = rec;
    }
  }
  const pending: PendingEvent[] = Array.isArray(o.pending)
    ? o.pending.filter(
        (e): e is PendingEvent =>
          !!e &&
          typeof e === "object" &&
          typeof (e as PendingEvent).l === "string" &&
          typeof (e as PendingEvent).ok === "boolean" &&
          typeof (e as PendingEvent).t === "number" &&
          !!(e as PendingEvent).x &&
          typeof (e as PendingEvent).x === "object",
      )
    : [];
  return cap({ version: 1, words, pending });
}

/** Enforce storage caps: drop the oldest pending events / least recently seen words. */
export function cap(s: WordMemoryState): WordMemoryState {
  let { words, pending } = s;
  if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
  const ids = Object.keys(words);
  if (ids.length > MAX_WORDS) {
    const keep = ids.sort((a, b) => words[b].lastSeen - words[a].lastSeen).slice(0, MAX_WORDS);
    const next: Record<string, WordRecord> = {};
    for (const id of keep) next[id] = words[id];
    words = next;
  }
  return words === s.words && pending === s.pending ? s : { version: 1, words, pending };
}

/** Apply grades at time `now`. */
export function applyGrades(s: WordMemoryState, grades: { id: string; grade: Grade }[], now: number): WordMemoryState {
  if (grades.length === 0) return s;
  const words = { ...s.words };
  for (const { id, grade } of grades) words[id] = schedule(words[id], grade, now, id);
  return cap({ ...s, words });
}

/**
 * Migration for learners who finished lessons before word memory existed (or
 * whose answers were never recorded): every vocab word of a completed lesson
 * without a record gets one, as if answered "good" once at completion time.
 * Low lesson accuracy shortens the first interval. Returns `s` unchanged if
 * nothing is missing.
 * Example: lesson done 3 days ago at 100 % -> record due ~1.5 days after
 * completion, i.e. already due now.
 */
export function seedFromCompleted(
  s: WordMemoryState,
  completed: Record<string, LessonRecord>,
  lessonVocab: Record<string, string[]>,
): WordMemoryState {
  let words: Record<string, WordRecord> | undefined;
  for (const [lessonId, rec] of Object.entries(completed)) {
    const vocab = lessonVocab[lessonId];
    if (!vocab) continue;
    const at = Date.parse(rec.completedAt);
    if (!Number.isFinite(at)) continue;
    for (const id of vocab) {
      if (s.words[id] || words?.[id]) continue;
      words ??= { ...s.words };
      const r = schedule(undefined, "good", at, id);
      const acc = Math.min(1, Math.max(0, rec.bestAccuracy || 0));
      const stability = Math.round(r.stability * (0.5 + acc / 2) * 1000) / 1000;
      words[id] = { ...r, stability, due: at + Math.round(intervalDays(stability) * DAY_MS) };
    }
  }
  return words ? cap({ ...s, words }) : s;
}

/** Ids due at `now`, most overdue first (ties: weakest first). */
export function dueIds(s: WordMemoryState, now: number, known?: (id: string) => boolean): string[] {
  return Object.values(s.words)
    .filter((r) => r.due <= now && (!known || known(r.id)))
    .sort((a, b) => a.due - b.due || a.stability - b.stability)
    .map((r) => r.id);
}

/** Earliest future due time, or undefined. */
export function nextDue(s: WordMemoryState, now: number, known?: (id: string) => boolean): number | undefined {
  let best: number | undefined;
  for (const r of Object.values(s.words)) {
    if (r.due > now && (!known || known(r.id)) && (best === undefined || r.due < best)) best = r.due;
  }
  return best;
}

/**
 * Mistakes notebook: words answered wrong, most recent first. A word leaves the
 * notebook after `clearAfter` correct answers in a row.
 */
export function mistakeIds(s: WordMemoryState, limit = 40, clearAfter = 3): string[] {
  return Object.values(s.words)
    .filter((r) => r.lastWrong !== undefined && r.run < clearAfter)
    .sort((a, b) => (b.lastWrong ?? 0) - (a.lastWrong ?? 0))
    .slice(0, limit)
    .map((r) => r.id);
}
