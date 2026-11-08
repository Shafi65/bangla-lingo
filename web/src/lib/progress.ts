import { useSyncExternalStore } from "react";
import type { UnitSummary } from "./types";

export interface LessonRecord {
  completedAt: string; // ISO timestamp of most recent completion
  bestAccuracy: number; // 0..1
  timesCompleted: number;
}

export interface ProgressState {
  version: 1;
  xp: number;
  streak: number;
  lastActiveDate: string | null; // local YYYY-MM-DD
  completed: Record<string, LessonRecord>;
}

/**
 * Persistence boundary for learner progress. MVP uses localStorage;
 * Phase 2 swaps in a Supabase-backed implementation behind this interface.
 */
export interface ProgressStore {
  get(): ProgressState;
  completeLesson(lessonId: string, xp: number, accuracy: number): ProgressState;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export const EMPTY_PROGRESS: ProgressState = Object.freeze({
  version: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completed: {},
}) as ProgressState;

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/** Streak to display: 0 if the learner missed yesterday and today. */
export function currentStreak(p: ProgressState, today?: string): number {
  // Only touch the clock when there is stored progress (never during prerender,
  // where the server snapshot is EMPTY_PROGRESS).
  if (!p.lastActiveDate) return 0;
  return daysBetween(p.lastActiveDate, today ?? localDateKey()) <= 1 ? p.streak : 0;
}

const STORAGE_KEY = "banglalingo.progress.v1";

export class LocalStorageProgressStore implements ProgressStore {
  private listeners = new Set<() => void>();
  private cacheRaw: string | null = null;
  private cacheState: ProgressState = EMPTY_PROGRESS;

  get(): ProgressState {
    if (typeof window === "undefined") return EMPTY_PROGRESS;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return this.cacheState;
    }
    if (raw === this.cacheRaw) return this.cacheState; // stable snapshot
    this.cacheRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as ProgressState) : null;
      this.cacheState =
        parsed && parsed.version === 1
          ? { ...EMPTY_PROGRESS, ...parsed }
          : EMPTY_PROGRESS;
    } catch {
      this.cacheState = EMPTY_PROGRESS;
    }
    return this.cacheState;
  }

  private write(next: ProgressState) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full / disabled: keep in memory only
      this.cacheRaw = null;
      this.cacheState = next;
    }
    this.listeners.forEach((l) => l());
  }

  completeLesson(lessonId: string, xp: number, accuracy: number) {
    const prev = this.get();
    const today = localDateKey();
    let streak = prev.streak;
    if (!prev.lastActiveDate) streak = 1;
    else {
      const gap = daysBetween(prev.lastActiveDate, today);
      if (gap === 1) streak += 1;
      else if (gap > 1 || gap < 0) streak = 1;
      else streak = Math.max(streak, 1);
    }
    const old = prev.completed[lessonId];
    const next: ProgressState = {
      ...prev,
      xp: prev.xp + xp,
      streak,
      lastActiveDate: today,
      completed: {
        ...prev.completed,
        [lessonId]: {
          completedAt: new Date().toISOString(),
          bestAccuracy: Math.max(old?.bestAccuracy ?? 0, accuracy),
          timesCompleted: (old?.timesCompleted ?? 0) + 1,
        },
      },
    };
    this.write(next);
    return next;
  }

  reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }
}

export const progressStore: ProgressStore = new LocalStorageProgressStore();

/** Reactive progress; returns EMPTY_PROGRESS during SSR / first hydration. */
export function useProgress(store: ProgressStore = progressStore): ProgressState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.get(),
    () => EMPTY_PROGRESS,
  );
}

export type LessonState = "locked" | "unlocked" | "completed";

/** Sequential unlock within a unit; first lesson of every unit is open. */
export function lessonStates(
  unit: UnitSummary,
  p: ProgressState,
): LessonState[] {
  return unit.lessons.map((l, i) => {
    if (p.completed[l.id]) return "completed";
    if (i === 0 || p.completed[unit.lessons[i - 1].id]) return "unlocked";
    return "locked";
  });
}
