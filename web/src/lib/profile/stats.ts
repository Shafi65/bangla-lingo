// Profile statistics: pure functions over the stored progress and word memory.
// No React, no DOM, and no clock reads: callers pass `today` (local date key)
// and `now` (epoch ms), so the page can compute them only after mount.
import { currentStreak, earnedRecords, localDateKey, type LessonRecord, type ProgressState } from "../progress";
import { strength, type Strength } from "../review/scheduler";
import type { WordMemoryState } from "../review/state";
import { numberUnits } from "../courseSections";
import type { CourseSummary, Track } from "../types";
import { addDays, dayDiff, isDateKey, weekdayMon } from "./dates";
import { EMPTY_STATS, type GameStats } from "../game/engine";

/** The fields of a review-catalog word the profile needs. */
export interface ProfileWord {
  id: string;
  /** First lesson that teaches it. */
  lesson: string;
}

export interface ProfileInput {
  progress: ProgressState;
  memory: WordMemoryState;
  words: readonly ProfileWord[];
  course: CourseSummary;
  /** Local date key for "today". */
  today: string;
  /** Epoch ms for "now". */
  now: number;
  /** Lifetime game counters (coins, quests, freezes); absent = none yet. */
  game?: GameStats;
}

// ------------------------------------------------------------------ days

/** Local date keys on which the learner did anything: XP logged, or a lesson completed. */
export function activeDaySet(p: ProgressState): Set<string> {
  const days = new Set<string>();
  for (const [k, v] of Object.entries(p.daily)) if (isDateKey(k) && v > 0) days.add(k);
  for (const rec of Object.values(p.completed)) {
    if (rec.placed) continue; // placement is not activity
    const t = Date.parse(rec.completedAt);
    if (Number.isFinite(t)) days.add(localDateKey(new Date(t)));
  }
  if (p.lastActiveDate && isDateKey(p.lastActiveDate)) days.add(p.lastActiveDate);
  return days;
}

/** Longest run of consecutive days in `days`. */
export function longestRun(days: Iterable<string>): number {
  const sorted = [...new Set(days)].filter(isDateKey).sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && dayDiff(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Best streak ever seen. The daily log only keeps ~60 days, so this is the
 * longest run in what is kept, never less than the stored streak (which was a
 * real run, even if it has since lapsed).
 */
export function bestStreak(p: ProgressState, today: string): number {
  return Math.max(longestRun(activeDaySet(p)), p.streak, currentStreak(p, today));
}

export interface DayXp {
  date: string;
  xp: number;
}

/** XP per day for the `days` days ending today (oldest first, zeros included). */
export function xpSeries(p: ProgressState, today: string, days = 30): DayXp[] {
  const out: DayXp[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, xp: Math.max(0, Math.round(p.daily[date] ?? 0)) });
  }
  return out;
}

/** Heat level of one calendar day: 0 nothing, 1 under half the goal, 2 under the goal, 3 goal met, 4 double goal. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(xp: number, active: boolean, goal: number): HeatLevel {
  if (xp <= 0) return active ? 1 : 0;
  if (xp < goal / 2) return 1;
  if (xp < goal) return 2;
  if (xp < goal * 2) return 3;
  return 4;
}

export interface CalendarDay {
  date: string;
  xp: number;
  active: boolean;
  level: HeatLevel;
  /** After today: drawn empty. */
  future: boolean;
}

/**
 * Streak calendar: `weeks` columns of Monday..Sunday, the last column holding
 * today. Days before the kept XP log still show as active when a lesson was
 * completed then.
 */
export function streakCalendar(p: ProgressState, today: string, weeks = 12): CalendarDay[][] {
  const active = activeDaySet(p);
  const goal = p.settings.dailyGoal;
  const start = addDays(today, -weekdayMon(today) - (weeks - 1) * 7);
  const cols: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const future = dayDiff(today, date) > 0;
      const xp = future ? 0 : Math.max(0, Math.round(p.daily[date] ?? 0));
      const on = !future && active.has(date);
      col.push({ date, xp, active: on, level: future ? 0 : heatLevel(xp, on, goal), future });
    }
    cols.push(col);
  }
  return cols;
}

// ----------------------------------------------------------------- words

/** Words the learner has met: graded in memory, or taught by a completed lesson (same rule as My words). */
export function learnedWordIds(
  words: readonly ProfileWord[],
  memory: WordMemoryState,
  completed: Record<string, LessonRecord>,
): string[] {
  return words.filter((w) => memory.words[w.id] || (completed[w.lesson] && !completed[w.lesson].placed)).map((w) => w.id);
}

export type StrengthCounts = Record<Strength, number>;

export function strengthCounts(ids: readonly string[], memory: WordMemoryState, now: number): StrengthCounts {
  const c: StrengthCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const id of ids) c[strength(memory.words[id], now)]++;
  return c;
}

/**
 * Whether the learner has finished at least one review (practice) session.
 * Practice answers are stored under their source lesson and practice adds no
 * lesson record, so this is inferred: a word answered more than once whose last
 * answer does not fall inside any completed lesson's run (the hour before its
 * completion time). It can over-count an abandoned lesson; it never needs
 * extra storage.
 */
export function hasReviewed(memory: WordMemoryState, completed: Record<string, LessonRecord>): boolean {
  const ends = Object.values(completed)
    .filter((r) => !r.placed)
    .map((r) => Date.parse(r.completedAt))
    .filter(Number.isFinite);
  const LESSON_WINDOW = 60 * 60_000;
  return Object.values(memory.words).some(
    (r) => r.reps >= 2 && !ends.some((end) => r.lastSeen <= end + 60_000 && r.lastSeen >= end - LESSON_WINDOW),
  );
}

// ----------------------------------------------------------------- units

export interface UnitProgress {
  id: string;
  /** "Unit 3" / "Script 2". */
  label: string;
  title: string;
  track: Track;
  /** "reading" for Reading-track units (they are their own track in the unit list). */
  strand?: "reading";
  done: number;
  total: number;
}

export function unitProgress(course: CourseSummary, completed: Record<string, LessonRecord>): UnitProgress[] {
  return numberUnits(course).map(({ unit, label }) => ({
    id: unit.id,
    label,
    title: unit.title,
    track: unit.track,
    ...(unit.strand ? { strand: unit.strand } : {}),
    done: unit.lessons.filter((l) => completed[l.id]).length,
    total: unit.lessons.length,
  }));
}

// --------------------------------------------------------------- summary

export interface ProfileStats {
  xp: number;
  streak: number;
  bestStreak: number;
  wordsLearned: number;
  /** All lessons marked done, including ones skipped via placement. */
  lessonsCompleted: number;
  /** Lessons the learner actually played (placed ones excluded); achievements use this. */
  lessonsPlayed: number;
  daysActive: number;
  /** Lessons completed with every exercise right first time. */
  perfectLessons: number;
  reviewed: boolean;
  units: UnitProgress[];
  /** Same, counting only lessons the learner played (placed ones excluded). */
  playedUnits: UnitProgress[];
  unitsFinished: number;
  /** All script-track units complete (false if the course has none). */
  scriptComplete: boolean;
  scriptDone: number;
  scriptTotal: number;
  strength: StrengthCounts;
  /** Nothing at all recorded yet. */
  isNew: boolean;
  /** Lifetime game counters (optional so callers that predate the game layer still type-check). */
  game?: GameStats;
}

/** A lesson counts as perfect when its best accuracy is 100 %. */
export const PERFECT = 0.999;

export function profileStats({ progress: p, memory, words, course, today, now, game }: ProfileInput): ProfileStats {
  const learned = learnedWordIds(words, memory, p.completed);
  const units = unitProgress(course, p.completed);
  // Effort-based figures (unit/script achievements) ignore placed lessons.
  const played = earnedRecords(p.completed);
  const playedUnits = unitProgress(course, played);
  const script = playedUnits.filter((u) => u.track === "script");
  const scriptDone = script.reduce((n, u) => n + u.done, 0);
  const scriptTotal = script.reduce((n, u) => n + u.total, 0);
  const lessonsCompleted = Object.keys(p.completed).length;
  const lessonsPlayed = Object.keys(played).length;
  const days = activeDaySet(p);
  return {
    xp: Math.max(0, Math.round(p.xp)),
    streak: currentStreak(p, today),
    bestStreak: bestStreak(p, today),
    wordsLearned: learned.length,
    lessonsCompleted,
    lessonsPlayed,
    daysActive: days.size,
    perfectLessons: Object.values(p.completed).filter((r) => r.bestAccuracy >= PERFECT).length,
    reviewed: hasReviewed(memory, p.completed),
    units,
    playedUnits,
    unitsFinished: playedUnits.filter((u) => u.total > 0 && u.done === u.total).length,
    scriptComplete: scriptTotal > 0 && scriptDone === scriptTotal,
    scriptDone,
    scriptTotal,
    strength: strengthCounts(learned, memory, now),
    isNew: p.xp <= 0 && lessonsCompleted === 0 && Object.keys(memory.words).length === 0,
    game: game ?? EMPTY_STATS,
  };
}
