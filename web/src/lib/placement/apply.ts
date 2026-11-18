// Applying a placement on this device. The placement result is kept under its own key so it
// never risks the progress blob; lessons are marked done through the ProgressStore API.
import type { ProgressStore } from "../progress";
import type { Background, Band, Group, Placement } from "./types";

export const PLACEMENT_KEY = "banglalingo.placement.v1";

export interface StoredPlacement {
  version: 1;
  takenAt: string; // ISO timestamp
  /** True once the learner chose "Start at …"; false for "Start from the beginning instead". */
  accepted: boolean;
  route: Placement["route"];
  startLessonId: string;
  levels: Record<Group, Band | null>;
  answered: number;
  background: Background;
}

/** Parse a stored blob; anything malformed is null. */
export function parseStoredPlacement(raw: string | null): StoredPlacement | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredPlacement> | null;
    if (!v || v.version !== 1 || typeof v.takenAt !== "string" || typeof v.startLessonId !== "string") return null;
    return v as StoredPlacement;
  } catch {
    return null;
  }
}

export function readStoredPlacement(): StoredPlacement | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredPlacement(window.localStorage.getItem(PLACEMENT_KEY));
  } catch {
    return null;
  }
}

export function toStored(p: Placement, bg: Background, accepted: boolean, now = new Date()): StoredPlacement {
  const levels = Object.fromEntries(p.groups.map((g) => [g.group, g.level])) as Record<Group, Band | null>;
  return {
    version: 1,
    takenAt: now.toISOString(),
    accepted,
    route: p.route,
    startLessonId: accepted ? p.startLessonId : "",
    levels,
    answered: p.answered,
    background: bg,
  };
}

/** Save the result. Returns false when storage is unavailable. */
export function writeStoredPlacement(v: StoredPlacement): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PLACEMENT_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark every lesson before the placed unit as done (0 XP, `accuracy` as the recorded score).
 * Lessons already completed are left alone. Returns how many were newly marked.
 *
 * Note: ProgressStore has no bulk call, so this is one completeLesson() per lesson; each also
 * counts as activity for today (streak 1, +0 XP).
 */
export function applyPlacement(store: ProgressStore, p: Placement, accuracy: number): number {
  const done = store.get().completed;
  let n = 0;
  for (const id of p.completeLessonIds) {
    if (done[id]) continue;
    store.completeLesson(id, 0, accuracy);
    n++;
  }
  return n;
}
