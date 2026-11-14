// Server-only: guidebook data (plans + lexicon) read from content/ at build time.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse } from "../content";
import type { Track } from "../types";

export interface GuideWord {
  id: string;
  bn: string;
  tr: string;
  en: string;
  notes?: string;
}

export interface GuideSentence {
  bn: string;
  tr: string;
  en: string;
}

export interface GuideLesson {
  id: string;
  title: string;
  goal?: string;
  grammar: string[];
  tip?: string;
  words: GuideWord[];
  sentences: GuideSentence[];
  kind: "lesson" | "review" | "checkpoint";
  /** True if the playable lesson exists in the course. */
  playable: boolean;
}

export interface GuideUnit {
  id: string;
  title: string;
  description?: string;
  track: Track;
  /** Null when the unit has no plan yet ("coming soon"). */
  lessons: GuideLesson[] | null;
  lessonCount: number;
  wordCount: number;
}

interface RawEntry {
  id: string;
  bn: string;
  tr: string;
  en: string;
  alt?: string[];
  pos: string;
  lesson: string;
  notes?: string;
  kolkata?: { bn?: string; tr?: string };
}
interface RawPlanLesson {
  id: string;
  title?: string;
  goal?: string;
  grammar?: string[];
  new?: string[];
  tip?: string;
  kind?: string;
  sentences?: (GuideSentence & { alt?: string[] })[];
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function jsonFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

export interface LexiconEntry extends RawEntry {
  unit: string;
}

let lexCache: LexiconEntry[] | undefined;

/** Every lexicon entry, in file then entry order, tagged with its unit file. */
export function getLexicon(): LexiconEntry[] {
  if (lexCache) return lexCache;
  const dir = path.join(getContentBaseDir(), "lexicon");
  const out: LexiconEntry[] = [];
  for (const f of jsonFiles(dir)) {
    const d = readJson<{ unit?: string; entries?: RawEntry[] }>(path.join(dir, f));
    const unit = d?.unit ?? f.replace(/\.json$/, "");
    for (const e of d?.entries ?? []) {
      if (e && typeof e.id === "string" && typeof e.bn === "string") out.push({ ...e, unit });
    }
  }
  return (lexCache = out);
}

function readPlan(unitId: string): RawPlanLesson[] | undefined {
  const d = readJson<{ lessons?: RawPlanLesson[] }>(
    path.join(getContentBaseDir(), "plans", `${unitId}.json`),
  );
  return Array.isArray(d?.lessons) ? d.lessons : undefined;
}

/** Pick up to 3 example sentences, favouring those that use the lesson's new words. */
function pickSentences(all: GuideSentence[], newBn: string[]): GuideSentence[] {
  const scored = all.map((s, i) => ({
    s,
    i,
    score: newBn.reduce((n, w) => n + (s.bn.includes(w) ? 1 : 0), 0),
  }));
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map(({ s }) => ({ bn: s.bn, tr: s.tr, en: s.en }));
}

let unitsCache: GuideUnit[] | undefined;

export function getGuideUnits(): GuideUnit[] {
  if (unitsCache) return unitsCache;
  const byId = new Map(getLexicon().map((e) => [e.id, e]));
  const playable = new Set(
    getCourse().units.flatMap((u) => u.lessons.map((l) => l.id)),
  );
  unitsCache = getCourse().units.map((u) => {
    const plan = readPlan(u.id);
    const lessons: GuideLesson[] | null = plan
      ? plan.map((pl) => {
          const words = (pl.new ?? []).flatMap((id) => {
            const e = byId.get(id);
            return e ? [{ id: e.id, bn: e.bn, tr: e.tr, en: e.en, notes: e.notes }] : [];
          });
          const kind =
            pl.kind === "review" || pl.kind === "checkpoint"
              ? pl.kind
              : /^review/i.test(pl.title ?? "")
                ? "review"
                : "lesson";
          return {
            id: pl.id,
            title: pl.title ?? pl.id,
            goal: pl.goal,
            grammar: pl.grammar ?? [],
            tip: pl.tip,
            words,
            sentences: pickSentences(pl.sentences ?? [], words.map((w) => w.bn)),
            kind,
            playable: playable.has(pl.id),
          };
        })
      : null;
    return {
      id: u.id,
      title: u.title,
      description: u.description,
      track: u.track,
      lessons,
      lessonCount: lessons?.length ?? u.lessons.length,
      wordCount: lessons?.reduce((n, l) => n + l.words.length, 0) ?? 0,
    };
  });
  return unitsCache;
}

export function getGuideUnit(id: string): GuideUnit | undefined {
  return getGuideUnits().find((u) => u.id === id);
}
