// Server-only: what the reviewer pages need from the course (order, lessons, Kolkata variants, hashes).
import "server-only";
import { getCourse, getLesson } from "../content";
import { getLexicon } from "../guide/data";
import { translitFor, type TranslitMap } from "../translit";
import type { Lesson, LessonKind, Level, Track } from "../types";
import { buildTargets, type KolkataMap, type Target } from "./targets";

export interface IndexLesson {
  id: string;
  title: string;
  kind: LessonKind;
  draft: boolean;
  /** [key, hash] of each reviewable item, for progress counting without shipping the lessons. */
  t: [string, string][];
}
export interface IndexUnit {
  id: string;
  title: string;
  track: Track;
  lessons: IndexLesson[];
}
export interface IndexLevel {
  level: Level;
  units: IndexUnit[];
}

let kolkataCache: KolkataMap | undefined;
function kolkataMap(): KolkataMap {
  if (kolkataCache) return kolkataCache;
  const m: KolkataMap = {};
  for (const e of getLexicon()) if (e.kolkata && (e.kolkata.bn || e.kolkata.tr)) m[e.id] = e.kolkata;
  return (kolkataCache = m);
}

/** Lesson ids in course order. */
export function getLessonOrder(): string[] {
  return getCourse().units.flatMap((u) => u.lessons.map((l) => l.id));
}

/** Units grouped beginner then intermediate, each in course order. */
export function getReviewIndex(): IndexLevel[] {
  const course = getCourse();
  const kol = kolkataMap();
  return (["beginner", "intermediate"] as const)
    .map((level) => ({
      level,
      units: course.units
        .filter((u) => (u.level ?? "beginner") === level)
        .map((u) => ({
          id: u.id,
          title: u.title,
          track: u.track,
          lessons: u.lessons.flatMap((s): IndexLesson[] => {
            const lesson = getLesson(s.id);
            if (!lesson) return [];
            return [
              {
                id: s.id,
                title: s.title,
                kind: s.kind,
                draft: s.draft,
                t: buildTargets(lesson, kol).map((x) => [x.key, x.hash]),
              },
            ];
          }),
        }))
        .filter((u) => u.lessons.length > 0),
    }))
    .filter((l) => l.units.length > 0);
}

export interface LessonReviewData {
  lesson: Lesson;
  unitTitle: string;
  translit: TranslitMap;
  kolkata: KolkataMap;
  targets: Target[];
  prev?: { id: string; title: string };
  next?: { id: string; title: string };
}

export function getLessonReviewData(id: string): LessonReviewData | undefined {
  const lesson = getLesson(id);
  if (!lesson) return undefined;
  const course = getCourse();
  const flat = course.units.flatMap((u) => u.lessons.map((l) => ({ id: l.id, title: l.title, unit: u.title })));
  const i = flat.findIndex((l) => l.id === id);
  const kol = kolkataMap();
  const kolkata: KolkataMap = {};
  for (const v of lesson.vocab) if (kol[v.id]) kolkata[v.id] = kol[v.id];
  return {
    lesson,
    unitTitle: flat[i]?.unit ?? "",
    translit: translitFor(lesson.exercises),
    kolkata,
    targets: buildTargets(lesson, kolkata),
    prev: i > 0 ? flat[i - 1] : undefined,
    next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : undefined,
  };
}
