// Pure item/set selection for Speaking practice. No React, no DOM, no fs: safe in tests.
import type { LessonRecord } from "../progress";

/** One thing to shadow: a sentence or phrase that has a recorded native clip. */
export interface SpeakItem {
  bn: string;
  tr: string;
  en: string;
  /** File name under /audio/ (from content/audio/manifest.json). */
  clip: string;
  /** Index into SpeakData.lessons. */
  l: number;
}

export interface SpeakData {
  /** Main-track units in course order; `lessons` indexes into `lessons`. */
  units: { id: string; title: string; lessons: number[] }[];
  /** Lesson ids. */
  lessons: string[];
  items: SpeakItem[];
}

export interface SpeakSet {
  id: string;
  title: string;
  subtitle: string;
  items: SpeakItem[];
}

export const RECENT_SET_ID = "recent";
/** "Recently learned" holds at most this many items. */
export const RECENT_LIMIT = 10;

const earned = (r: LessonRecord | undefined): r is LessonRecord => !!r && r.placed !== true;

/** Ids of units whose every lesson the learner has played (placed lessons do not count). */
export function completedUnitIds(data: SpeakData, completed: Record<string, LessonRecord>): string[] {
  return data.units
    .filter((u) => u.lessons.length > 0 && u.lessons.every((i) => earned(completed[data.lessons[i]])))
    .map((u) => u.id);
}

function itemsByLesson(data: SpeakData): Map<number, SpeakItem[]> {
  const m = new Map<number, SpeakItem[]>();
  for (const it of data.items) {
    const a = m.get(it.l);
    if (a) a.push(it);
    else m.set(it.l, [it]);
  }
  return m;
}

/**
 * The sets a learner can practise, "Recently learned" first (when there is anything), then one per
 * completed unit in course order. Units with no clipped item are left out.
 *  - Recently learned: items of the most recently played lessons (newest first), whole lessons in
 *    order, up to RECENT_LIMIT items.
 */
export function buildSets(data: SpeakData, completed: Record<string, LessonRecord>): SpeakSet[] {
  const byLesson = itemsByLesson(data);
  const sets: SpeakSet[] = [];

  const recentLessons = data.lessons
    .map((id, i) => ({ i, rec: completed[id] }))
    .filter((x): x is { i: number; rec: LessonRecord } => earned(x.rec) && byLesson.has(x.i))
    .map((x) => ({ i: x.i, t: Date.parse(x.rec.completedAt) || 0 }))
    .sort((a, b) => b.t - a.t || b.i - a.i);
  const recent: SpeakItem[] = [];
  for (const { i } of recentLessons) {
    if (recent.length >= RECENT_LIMIT) break;
    recent.push(...byLesson.get(i)!);
  }
  if (recent.length > 0) {
    sets.push({
      id: RECENT_SET_ID,
      title: "Recently learned",
      subtitle: "From the lessons you played last",
      items: recent.slice(0, RECENT_LIMIT),
    });
  }

  const done = new Set(completedUnitIds(data, completed));
  for (const u of data.units) {
    if (!done.has(u.id)) continue;
    const items = u.lessons.flatMap((i) => byLesson.get(i) ?? []);
    if (items.length === 0) continue;
    sets.push({ id: u.id, title: u.title, subtitle: "Whole unit", items });
  }
  return sets;
}

/** Stable key for an item in the history store. */
export const itemKey = (it: Pick<SpeakItem, "bn">): string => it.bn.normalize("NFC").trim();
