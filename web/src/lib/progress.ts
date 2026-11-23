import { useSyncExternalStore } from "react";
import { EMPTY_MEMORY, parseMemory, type WordMemoryState } from "./review/state";
import type { CourseSummary, UnitSummary } from "./types";
import { THEME_KEY } from "./ui/theme-script";

export interface LessonRecord {
  completedAt: string; // ISO timestamp of most recent completion
  bestAccuracy: number; // 0..1
  timesCompleted: number;
  /**
   * Marked done without being played (placement test or checkpoint test-out): no stars (bestAccuracy 0,
   * timesCompleted 0), no XP, no review seeding. Dropped as soon as the learner actually completes the lesson.
   */
  placed?: true;
  /** With `placed`: "checkpoint" = tested out; absent = the placement test. */
  via?: "checkpoint";
}

/** How lessons can be marked done without being played. */
export type SkipSource = "placement" | "checkpoint";

/** How a not-played lesson was marked done; undefined for a lesson the learner played. */
export function skipSource(rec: LessonRecord | undefined): SkipSource | undefined {
  if (rec?.placed !== true) return undefined;
  return rec.via === "checkpoint" ? "checkpoint" : "placement";
}

/** Marked done by a checkpoint test-out. */
export function isTestedOut(rec: LessonRecord | undefined): boolean {
  return skipSource(rec) === "checkpoint";
}

/** A lesson the learner skipped past via placement rather than played. */
export function isPlaced(rec: LessonRecord | undefined): boolean {
  return rec?.placed === true;
}

/** Records of lessons the learner actually played (placed ones removed). */
export function earnedRecords(completed: Record<string, LessonRecord>): Record<string, LessonRecord> {
  const out: Record<string, LessonRecord> = {};
  for (const [id, rec] of Object.entries(completed)) if (!isPlaced(rec)) out[id] = rec;
  return out;
}

/** Tolerant read of stored lesson records; `placed` is kept only as the literal `true`, with no score (and `via` only as "checkpoint"). */
export function sanitizeCompleted(c: unknown): Record<string, LessonRecord> {
  const out: Record<string, LessonRecord> = {};
  if (!c || typeof c !== "object") return out;
  for (const [id, v] of Object.entries(c as Record<string, Partial<LessonRecord> | null>)) {
    if (!v || typeof v !== "object") continue;
    const { placed, via, ...rest } = v;
    out[id] =
      placed === true
        ? { ...(rest as LessonRecord), bestAccuracy: 0, timesCompleted: 0, placed: true, ...(via === "checkpoint" ? { via } : {}) }
        : (rest as LessonRecord);
  }
  return out;
}

/** How transliteration (romanized Bengali) is displayed. */
export type TranslitMode = "always" | "auto" | "hidden";
export type TtsSpeed = "slow" | "normal" | "fast";
/** Appearance preference; "system" follows the OS. */
export type ThemePref = "light" | "dark" | "system";
export const THEME_PREFS: readonly ThemePref[] = ["light", "dark", "system"];
export const DAILY_GOALS = [10, 20, 30, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

export interface Settings {
  translit: TranslitMode;
  /**
   * Intermediate ("script only") lessons hide transliteration until tapped; turn this on to follow the
   * `translit` setting there too.
   */
  alwaysRomanize: boolean;
  sound: boolean;
  ttsSpeed: TtsSpeed;
  dailyGoal: DailyGoal;
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  translit: "auto",
  alwaysRomanize: false,
  sound: true,
  ttsSpeed: "normal",
  dailyGoal: 20,
  theme: "system",
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
  /**
   * Days covered by a streak freeze (YYYY-MM-DD, last ~60 days). A frozen day keeps the streak
   * alive across a missed day but does not add to it.
   */
  frozen: string[];
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
  /**
   * Mark lessons done without playing them (placement test or checkpoint test-out), in one write and
   * one notification. No XP, streak, last-active or daily-log change, no stars, no word-memory seeding;
   * records are flagged `placed` (plus `via: "checkpoint"` for a test-out). Lessons already completed
   * are left alone.
   */
  completeLessons(ids: string[], opts: { source: SkipSource }): ProgressState;
  /** XP from a practice session (counts for the daily goal and streak). */
  recordPractice(xp: number): ProgressState;
  /** Mark missed days as covered by streak freezes (see applyFreezePlan). */
  freezeDays(days: string[]): ProgressState;
  updateSettings(patch: Partial<Settings>): ProgressState;
  /** Per-word spaced-review memory (see lib/review/). */
  getWordMemory(): WordMemoryState;
  /** Replace word memory with `fn(previous)`; returning the same object is a no-op. */
  updateWordMemory(fn: (prev: WordMemoryState) => WordMemoryState): WordMemoryState;
  /** Erase learning progress and word memory; settings are kept. */
  reset(): void;
  /**
   * Replace the learning progress (everything but settings) in one write and one notification. Used by
   * account sync (lib/sync/) to apply a merged snapshot; settings go through updateSettings.
   */
  replaceProgress(next: Omit<ProgressState, "settings" | "version" | "frozen"> & { frozen?: string[] }): ProgressState;
  subscribe(listener: () => void): () => void;
}

export const EMPTY_PROGRESS: ProgressState = Object.freeze({
  version: 1,
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completed: {},
  daily: {},
  frozen: [],
  settings: DEFAULT_SETTINGS,
}) as ProgressState;

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

// NOTE: the helpers below only touch the clock when there is stored progress,
// so they never read the time during prerender (server snapshot is EMPTY_PROGRESS).

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The day after `key` (YYYY-MM-DD). */
export function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Valid, unique, sorted frozen-day keys. */
export function sanitizeFrozen(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((k): k is string => typeof k === "string" && DAY_KEY.test(k)))].sort();
}

/**
 * The day the streak is "kept up to": the last active day, carried forward through any frozen days
 * right after it. Null when the learner has never been active.
 */
export function streakEnd(p: ProgressState): string | null {
  if (!p.lastActiveDate) return null;
  const frozen = new Set(p.frozen ?? []);
  let end = p.lastActiveDate;
  for (let i = 0; i < 400; i++) {
    const n = nextDayKey(end);
    if (!frozen.has(n)) break;
    end = n;
  }
  return end;
}

/**
 * Days a freeze would have to cover so the streak survives until today: the missed days between the
 * streak's end and today (yesterday included, today excluded). Empty when nothing is missed, when there
 * is no streak, or when more days were missed than `available` freezes can cover (the streak is lost).
 */
export function freezePlan(p: ProgressState, available: number, today: string): string[] {
  const end = streakEnd(p);
  if (!end || p.streak <= 0 || available <= 0) return [];
  const missed = daysBetween(end, today) - 1;
  if (missed < 1 || missed > available) return [];
  const days: string[] = [];
  let d = end;
  for (let i = 0; i < missed; i++) {
    d = nextDayKey(d);
    days.push(d);
  }
  return days;
}

/** Streak to display: 0 if the learner missed yesterday and today (frozen days excepted). */
export function currentStreak(p: ProgressState, today?: string): number {
  const end = streakEnd(p);
  if (!end) return 0;
  return daysBetween(end, today ?? localDateKey()) <= 1 ? p.streak : 0;
}

/**
 * "done": practiced today. "at-risk": streak alive but nothing yet today.
 * "none": no streak running.
 */
export type StreakStatus = "done" | "at-risk" | "none";

export function streakStatus(p: ProgressState, today?: string): StreakStatus {
  const end = streakEnd(p);
  if (!end) return "none";
  const gap = daysBetween(end, today ?? localDateKey());
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
  if (!rec || rec.placed) return 0;
  if (rec.bestAccuracy >= 0.95) return 3;
  if (rec.bestAccuracy >= 0.75) return 2;
  return 1;
}

/**
 * Old versions (and the pre-paint script in app/layout.tsx) keep the theme
 * under a small key of its own. Used once, for stored settings that predate
 * the `theme` field; settings are the source of truth after that.
 */
function legacyTheme(): ThemePref | undefined {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the tiny key the pre-paint script reads in step with settings.theme. */
function mirrorTheme(theme: ThemePref) {
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage disabled: nothing to mirror
  }
}

export function sanitizeSettings(s: unknown, fallbackTheme: ThemePref = DEFAULT_SETTINGS.theme): Settings {
  const v = (s ?? {}) as Partial<Settings>;
  return {
    theme: THEME_PREFS.includes(v.theme as ThemePref) ? (v.theme as ThemePref) : fallbackTheme,
    translit: (["always", "auto", "hidden"] as const).includes(v.translit as TranslitMode)
      ? (v.translit as TranslitMode)
      : DEFAULT_SETTINGS.translit,
    alwaysRomanize: typeof v.alwaysRomanize === "boolean" ? v.alwaysRomanize : DEFAULT_SETTINGS.alwaysRomanize,
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
  const end = streakEnd(prev);
  if (!end) streak = 1;
  else {
    const gap = daysBetween(end, today);
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
  const frozen = (prev.frozen ?? []).filter((k) => daysBetween(k, today) <= 60 && k !== today);
  return { ...prev, xp: prev.xp + xp, streak, lastActiveDate: today, daily, frozen };
}

/** True if the stored blob already has a valid settings.theme (so migration is done). */
function storedTheme(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const t = (JSON.parse(raw) as { settings?: { theme?: unknown } }).settings?.theme;
    return THEME_PREFS.includes(t as ThemePref);
  } catch {
    return false;
  }
}

const STORAGE_KEY = "banglalingo.progress.v1";
const MEMORY_KEY = "banglalingo.memory.v1";
export { STORAGE_KEY as PROGRESS_KEY, MEMORY_KEY };

export class LocalStorageProgressStore implements ProgressStore {
  private listeners = new Set<() => void>();
  private cacheRaw: string | null = null;
  private cacheState: ProgressState = EMPTY_PROGRESS;
  private memoryOnly = false;

  get(): ProgressState {
    if (typeof window === "undefined" || this.memoryOnly) return this.cacheState;
    let raw: string | null = null;
    let legacy: ThemePref | undefined;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
      legacy = legacyTheme();
    } catch {
      return this.cacheState;
    }
    const key = `${legacy ?? ""}|${raw ?? ""}`;
    if (key === this.cacheRaw) return this.cacheState; // stable snapshot
    this.cacheRaw = key;
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<ProgressState>) : null;
      this.cacheState =
        parsed && parsed.version === 1
          ? {
              ...EMPTY_PROGRESS,
              ...parsed,
              completed: sanitizeCompleted(parsed.completed),
              daily: parsed.daily ?? {},
              frozen: sanitizeFrozen(parsed.frozen),
              settings: sanitizeSettings(parsed.settings),
            }
          : EMPTY_PROGRESS;
    } catch {
      this.cacheState = EMPTY_PROGRESS;
    }
    // Migration: a theme chosen before it lived in settings.
    if (legacy && this.cacheState.settings.theme === "system" && !storedTheme(raw)) {
      this.cacheState = {
        ...this.cacheState,
        settings: { ...this.cacheState.settings, theme: legacy },
      };
    }
    return this.cacheState;
  }

  private write(next: ProgressState) {
    mirrorTheme(next.settings.theme);
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

  completeLessons(ids: string[], opts: { source: SkipSource }) {
    const prev = this.get();
    if (opts.source !== "placement" && opts.source !== "checkpoint") return prev;
    const completedAt = new Date().toISOString();
    const completed = { ...prev.completed };
    let changed = false;
    for (const id of ids) {
      if (completed[id]) continue;
      completed[id] = {
        completedAt,
        bestAccuracy: 0,
        timesCompleted: 0,
        placed: true,
        ...(opts.source === "checkpoint" ? { via: "checkpoint" as const } : {}),
      };
      changed = true;
    }
    if (!changed) return prev;
    const next: ProgressState = { ...prev, completed };
    this.write(next);
    return next;
  }

  recordPractice(xp: number) {
    const next = withActivity(this.get(), xp);
    this.write(next);
    return next;
  }

  freezeDays(days: string[]) {
    const prev = this.get();
    const add = sanitizeFrozen(days).filter((d) => !prev.frozen.includes(d));
    if (!add.length) return prev;
    const next: ProgressState = { ...prev, frozen: sanitizeFrozen([...prev.frozen, ...add]) };
    this.write(next);
    return next;
  }

  updateSettings(patch: Partial<Settings>) {
    const prev = this.get();
    const next = { ...prev, settings: sanitizeSettings({ ...prev.settings, ...patch }) };
    this.write(next);
    return next;
  }

  replaceProgress(core: Omit<ProgressState, "settings" | "version" | "frozen"> & { frozen?: string[] }) {
    const prev = this.get();
    const next: ProgressState = {
      ...prev,
      xp: core.xp,
      streak: core.streak,
      lastActiveDate: core.lastActiveDate,
      completed: sanitizeCompleted(core.completed),
      daily: { ...core.daily },
      // Older server documents carry no frozen days: keep this device's.
      frozen: core.frozen ? sanitizeFrozen(core.frozen) : prev.frozen,
    };
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
