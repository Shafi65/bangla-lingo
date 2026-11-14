// Server-only: the reviewable word catalog, built from course content at build time.
// A word is reviewable once some lesson teaches it (lists it in `vocab`).
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse, getLesson } from "../content";
import type { WordIndex } from "./targets";
import type { ReviewWord } from "./types";

function letterIds(): Set<string> {
  const out = new Set<string>();
  const dir = path.join(getContentBaseDir(), "lexicon");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as {
        entries?: { id?: unknown; pos?: unknown }[];
      };
      for (const e of d.entries ?? []) if (e?.pos === "letter" && typeof e.id === "string") out.add(e.id);
    } catch {
      // unreadable lexicon file: treat its entries as ordinary words
    }
  }
  return out;
}

let cached: { words: ReviewWord[]; index: WordIndex } | undefined;

function build() {
  const letters = letterIds();
  const words: ReviewWord[] = [];
  const seen = new Set<string>();
  const lessons: Record<string, string[]> = {};
  for (const unit of getCourse().units) {
    for (const ls of unit.lessons) {
      const lesson = getLesson(ls.id);
      if (!lesson) continue;
      lessons[lesson.id] = lesson.vocab.map((v) => v.id);
      for (const v of lesson.vocab) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        words.push({
          id: v.id,
          bn: v.bn,
          tr: v.tr,
          en: v.en,
          lesson: lesson.id,
          lessonTitle: lesson.title,
          unit: unit.id,
          unitTitle: unit.title,
          letter: letters.has(v.id),
        });
      }
    }
  }
  const index: WordIndex = { entries: words.map((w) => [w.id, w.bn]), lessons };
  return { words, index };
}

/** Every reviewable word, in course order (first lesson that teaches it). */
export function getReviewWords(): ReviewWord[] {
  return (cached ??= build()).words;
}

/** Compact bn -> id index for mapping exercises to words on the client. */
export function getWordIndex(): WordIndex {
  return (cached ??= build()).index;
}
