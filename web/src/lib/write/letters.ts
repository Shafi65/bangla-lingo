// Builds the /write letter list from the script track (read-only course data).
// A script lesson's title lists its letters after a colon ("Vowels 1: অ আ"); each one is matched
// to a vocab item of that lesson, so tr/en/audio come from the course and no spelling is invented.

export type LetterKind = "vowel" | "consonant" | "sign" | "mark";

export interface WriteLetter {
  /** Vocab id of the matching item, e.g. "l-ka" (unique across the course). */
  id: string;
  /** The glyph to trace. */
  glyph: string;
  /** Text to play for the sound (the vocab item's own text; a sign is played on a consonant). */
  speak: string;
  tr: string;
  en: string;
  kind: LetterKind;
}

export interface WriteLesson {
  id: string;
  title: string;
  letters: WriteLetter[];
}

export interface WriteGroup {
  id: string;
  title: string;
  lessons: WriteLesson[];
}

interface LessonLike {
  id: string;
  title: string;
  vocab: { id: string; bn: string; tr: string; en: string }[];
}

const isBengali = (s: string) => /^[ঀ-৿]/.test(s);
const nfc = (s: string) => s.normalize("NFC");

export function kindOf(unitId: string): LetterKind | null {
  if (unitId.startsWith("s01")) return "vowel";
  if (unitId.startsWith("s02")) return "consonant";
  if (unitId.startsWith("s03")) return "sign";
  return null;
}

/** Letters listed in a script lesson's title, matched to its vocab. */
export function lettersOfLesson(lesson: LessonLike, unitKind: LetterKind): WriteLetter[] {
  const colon = lesson.title.indexOf(":");
  if (colon < 0) return [];
  const tokens = lesson.title
    .slice(colon + 1)
    .split(/\s+/)
    .filter((t) => t && isBengali(t));
  const used = new Set<string>();
  const out: WriteLetter[] = [];
  for (const token of tokens) {
    const t = nfc(token);
    const candidates = lesson.vocab.filter((v) => /^[lk]-/.test(v.id) && !used.has(v.id));
    const v = candidates.find((c) => nfc(c.bn) === t) ?? candidates.find((c) => nfc(c.bn).includes(t));
    if (!v) continue;
    used.add(v.id);
    // Standalone marks (ং ঃ ঁ ৎ) live in the consonants unit but are not consonants.
    const kind: LetterKind = unitKind === "consonant" && /[ঁ-ঃৎ]/.test(t) ? "mark" : unitKind;
    out.push({ id: v.id, glyph: t, speak: v.bn, tr: v.tr, en: v.en, kind });
  }
  return out;
}

export function buildWriteGroups(
  units: { id: string; title: string; lessons: string[] }[],
  getLesson: (id: string) => LessonLike | undefined,
): WriteGroup[] {
  const groups: WriteGroup[] = [];
  for (const unit of units) {
    const kind = kindOf(unit.id);
    if (!kind) continue;
    const lessons: WriteLesson[] = [];
    for (const lid of unit.lessons) {
      const lesson = getLesson(lid);
      if (!lesson) continue;
      const letters = lettersOfLesson(lesson, kind);
      if (letters.length) lessons.push({ id: lesson.id, title: lesson.title, letters });
    }
    if (lessons.length) groups.push({ id: unit.id, title: unit.title.replace(/^Script:\s*/, ""), lessons });
  }
  return groups;
}

export const flattenLetters = (groups: readonly WriteGroup[]): WriteLetter[] =>
  groups.flatMap((g) => g.lessons.flatMap((l) => l.letters));
