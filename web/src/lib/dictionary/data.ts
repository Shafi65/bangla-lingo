// Server-only: compact dictionary payload built from content/lexicon.
import "server-only";
import { getCourse } from "../content";
import { getGuideUnits, getLexicon } from "../guide/data";

/** Compact entry; optional fields are omitted when empty. */
export interface DictEntry {
  id: string;
  bn: string;
  tr: string;
  en: string;
  /** Other English glosses. */
  alt?: string[];
  pos: string;
  /** Index into DictData.units. */
  u: number;
  /** Lesson id that teaches it. */
  l: string;
  /** Kolkata variant, "bn · tr". */
  k?: string;
  notes?: string;
}

export interface DictData {
  units: { id: string; title: string; track: string }[];
  /** lesson id -> lesson title */
  lessons: Record<string, string>;
  pos: string[];
  entries: DictEntry[];
}

export function getDictionary(): DictData {
  const course = getCourse();
  const guide = getGuideUnits();
  const unitIds = course.units.map((u) => u.id);
  const lessons: Record<string, string> = {};
  for (const u of guide) for (const l of u.lessons ?? []) lessons[l.id] = l.title;

  const used = new Set<string>();
  const entries: DictEntry[] = getLexicon().map((e) => {
    used.add(e.pos);
    let u = unitIds.indexOf(e.unit);
    if (u < 0) u = 0;
    const k = e.kolkata ? [e.kolkata.bn, e.kolkata.tr].filter(Boolean).join(" · ") : "";
    return {
      id: e.id,
      bn: e.bn,
      tr: e.tr,
      en: e.en,
      ...(e.alt?.length ? { alt: e.alt } : {}),
      pos: e.pos,
      u,
      l: e.lesson,
      ...(k ? { k } : {}),
      ...(e.notes ? { notes: e.notes } : {}),
    };
  });
  return {
    units: course.units.map((u) => ({ id: u.id, title: u.title, track: u.track })),
    lessons,
    pos: [...used].sort(),
    entries,
  };
}
