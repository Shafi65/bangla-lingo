import { useSyncExternalStore } from "react";
import { EMPTY_MEMORY, parseMemory, type WordMemoryState } from "./review/state";
import type { CourseSummary, UnitSummary } from "./types";

export interface LessonRecord {
  completedAt: string; // ISO timestamp of most recent completion
  bestAccuracy: number; // 0..1
  timesCompleted: number;
}

/** How transliteration (romanized Bengali) is displayed. */
export type TranslitMode = "always" | "auto" | "hidden";
export type TtsSpeed = "slow" | "normal" | "fast";
export const DAILY_GOALS = [10, 20, 30, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

export interface Settings {
  translit: TranslitMode;
  sound: boolean;
  ttsSpeed: TtsSpeed;
  dailyGoal: DailyGoal;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  translit: "auto",
  sound: true,
  ttsSpeed: "normal",
  dailyGoal: 20,
}) as Settings;

export const TTS_RATES: Record<TtsSpeed, number> = {
  slow: 0.65,
  normal: 0.85,
  fast: 1.05,
};

export interface ProgressState {
  version: 1;
  xp: number;
  streak: number;
  lastActiveDate: string | null; // local YYYY-MM-DD
  completed: Record<string, LessonRecord>;
  /** XP earned per local day (YYYY-MM-DD), last ~60 days. */
  daily: Record<string, number>;
  settings: Settings;
}

/**
 * Persistence boundary for learner progress and preferences. MVP uses
 * localStorage; Phase 2 swaps in a Supabase-backed implementation behind
 * this interface.
 */
export interface ProgressStore {
  get(): ProgressState;
  completeLesson(lessonId: string, xp: number, accuracy: number): ProgressState;
  /** XP from a practice session (counts for the daily goal and streak). */
  recordPractice(xp: number): ProgressState;
  updateSettings(patch: Partial<Settings>): ProgressState;
  /** Per-word spaced-review memory (see lib/review/). */
  getWordMemory(): WordMemoryState;
  /** Replace word memory with `fn(previous)`; returning the same object is a no-op. */
  updateWordMemory(fn: (prev: WordMemoryState) => WordMemoryState): WordMemoryState;
  /** Erase learning progress and word memory; settings are kept. */
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export const EMPTY_PROGRESS: ProgressState = Object.freeze({
  version: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completed: {},
  daily: {},
  settings: DEFAULT_SETTINGS,
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

// NOTE: the helpers below only touch the clock when there is stored progress,
// so they never read the time during prerender (server snapshot is EMPTY_PROGRESS).

/** Streak to display: 0 if the learner missed yesterday and today. */
export function currentStreak(p: ProgressState, today?: string): number {
  if (!p.lastActiveDate) return 0;
  return daysBetween(p.lastActiveDate, today ?? localDateKey()) <= 1 ? p.streak : 0;
}

/**
 * "done": practiced today. "at-risk": streak alive but nothing yet today.
 * "none": no streak running.
 */
export type StreakStatus = "done" | "at-risk" | "none";

export function streakStatus(p: ProgressState, today?: string): StreakStatus {
  if (!p.lastActiveDate) return "none";
  const gap = daysBetween(p.lastActiveDate, today ?? localDateKey());
  if (gap <= 0) return "done";
  if (gap === 1 && p.streak > 0) return "at-risk";
  return "none";
}

export function todayXp(p: ProgressState, today?: string): number {
  if (!p.lastActiveDate) return 0;
  return p.daily[today ?? localDateKey()] ?? 0;
}

/** 1–3 stars from best accuracy; 0 if never completed. */
export function lessonStars(rec: LessonRecord | undefined): 0 | 1 | 2 | 3 {
  if (!rec) return 0;
  if (rec.bestAccuracy >= 0.95) return 3;
  if (rec.bestAccuracy >= 0.75) return 2;
  return 1;
}

function sanitizeSettings(s: unknown): Settings {
  const v = (s ?? {}) as Partial<Settings>;
  return {
    translit: (["always", "auto", "hidden"] as const).includes(v.translit as TranslitMode)
      ? (v.translit as TranslitMode)
      : DEFAULT_SETTINGS.translit,
    sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
    ttsSpeed: (["slow", "normal", "fast"] as const).includes(v.ttsSpeed as TtsSpeed)
      ? (v.ttsSpeed as TtsSpeed)
      : DEFAULT_SETTINGS.ttsSpeed,
    dailyGoal: DAILY_GOALS.includes(v.dailyGoal as DailyGoal)
      ? (v.dailyGoal as DailyGoal)
      : DEFAULT_SETTINGS.dailyGoal,
  };
}

/** Advance the streak and daily XP for activity happening today. */
function withActivity(prev: ProgressState, xp: number): ProgressState {
  const today = localDateKey();
  let streak = prev.streak;
  if (!prev.lastActiveDate) streak = 1;
  else {
    const gap = daysBetween(prev.lastActiveDate, today);
    if (gap === 1) streak += 1;
    else if (gap > 1 || gap < 0) streak = 1;
    else streak = Math.max(streak, 1);
  }
  // Keep the daily log small.
  const daily: Record<string, number> = {};
  for (const [k, v] of Object.entries(prev.daily)) {
    if (daysBetween(k, today) <= 60) daily[k] = v;
  }
  daily[today] = (daily[today] ?? 0) + xp;
  return { ...prev, xp: prev.xp + xp, streak, lastActiveDate: today, daily };
}

const STORAGE_KEY = "banglalingo.progress.v1";
const MEMORY_KEY = "banglalingo.memory.v1";

export class LocalStorageProgressStore implements ProgressStore {
  private listeners = new Set<() => void>();
  private cacheRaw: string | null = null;
  private cacheState: ProgressState = EMPTY_PROGRESS;
  private memoryOnly = false;

  get(): ProgressState {
    if (typeof window === "undefined" || this.memoryOnly) return this.cacheState;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return this.cacheState;
    }
    if (raw === this.cacheRaw) return this.cacheState; // stable snapshot
    this.cacheRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<ProgressState>) : null;
      this.cacheState =
        parsed && parsed.version === 1
          ? {
              ...EMPTY_PROGRESS,
              ...parsed,
              completed: parsed.completed ?? {},
              daily: parsed.daily ?? {},
              settings: sanitizeSettings(parsed.settings),
            }
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
      this.memoryOnly = true;
      this.cacheState = next;
    }
    this.listeners.forEach((l) => l());
  }

  completeLesson(lessonId: string, xp: number, accuracy: number) {
    const prev = this.get();
    const old = prev.completed[lessonId];
    const next: ProgressState = {
      ...withActivity(prev, xp),
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

  recordPractice(xp: number) {
    const next = withActivity(this.get(), xp);
    this.write(next);
    return next;
  }

  updateSettings(patch: Partial<Settings>) {
    const prev = this.get();
    const next = { ...prev, settings: sanitizeSettings({ ...prev.settings, ...patch }) };
    this.write(next);
    return next;
  }

  reset() {
    const settings = this.get().settings;
    this.writeMemory(EMPTY_MEMORY, false);
    this.write({ ...EMPTY_PROGRESS, settings });
  }

  // Word memory lives under its own key so the (larger, frequently written)
  // per-word data never risks the core progress blob.
  private memRaw: string | null = null;
  private memState: WordMemoryState = EMPTY_MEMORY;
  private memOnly = false;

  getWordMemory(): WordMemoryState {
    if (typeof window === "undefined" || this.memOnly) return this.memState;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(MEMORY_KEY);
    } catch {
      return this.memState;
    }
    if (raw === this.memRaw) return this.memState; // stable snapshot
    this.memRaw = raw;
    this.memState = raw ? parseMemory(raw) : EMPTY_MEMORY;
    return this.memState;
  }

  private writeMemory(next: WordMemoryState, notify = true) {
    this.memState = next;
    if (typeof window === "undefined") return;
    if (!this.memOnly) {
      try {
        const raw = JSON.stringify(next);
        window.localStorage.setItem(MEMORY_KEY, raw);
        this.memRaw = raw;
      } catch {
        this.memOnly = true; // storage full / disabled: keep in memory only
      }
    }
    if (notify) this.listeners.forEach((l) => l());
  }

  updateWordMemory(fn: (prev: WordMemoryState) => WordMemoryState): WordMemoryState {
    const prev = this.getWordMemory();
    let next: WordMemoryState;
    try {
      next = fn(prev);
    } catch {
      return prev;
    }
    if (next !== prev) this.writeMemory(next);
    return next;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === MEMORY_KEY || e.key === null) listener();
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

/** Reactive word memory; EMPTY_MEMORY during SSR / first hydration. */
export function useWordMemory(store: ProgressStore = progressStore): WordMemoryState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getWordMemory(),
    () => EMPTY_MEMORY,
  );
}

export function useSettings(): Settings {
  return useProgress().settings;
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

/** The single recommended next lesson, following the course order. */
export function nextLessonId(
  course: CourseSummary,
  p: ProgressState,
): string | undefined {
  for (const unit of course.units) {
    const states = lessonStates(unit, p);
    const i = states.findIndex((s) => s === "unlocked");
    if (i >= 0) return unit.lessons[i].id;
  }
  return undefined;
}
