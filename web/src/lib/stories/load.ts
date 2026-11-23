// Server-only: reads content/stories/*.json at build time and turns each line into tappable words.
//
// Glosses come from content/lexicon/, limited to what is taught by the end of the story's unit
// (course order), so the index matches content/scripts/validate-stories.mjs. A missing stories
// folder (e.g. the demo fixture) just means no stories; a malformed story is skipped with a warning.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse } from "../content";
import { buildFormIndex, segmentLine, type FormIndex } from "./segment";
import type { Gloss, Story, StoryBnText, StoryOption, StoryQuestion, StorySummary } from "./types";

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isBn = (v: unknown): v is StoryBnText => {
  const t = v as StoryBnText | null;
  return !!t && isStr(t.bn) && isStr(t.tr) && isStr(t.en);
};
const bnOf = (t: StoryBnText): StoryBnText => ({ bn: t.bn.normalize("NFC"), tr: t.tr, en: t.en });
type Senses = Record<string, string> | undefined;
const sensesOf = (v: unknown): Senses =>
  v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string")
    ? (v as Record<string, string>)
    : undefined;

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

interface LexEntry {
  id?: unknown;
  bn?: unknown;
  tr?: unknown;
  en?: unknown;
  alt?: unknown;
  pos?: unknown;
  notes?: unknown;
}

/** Lexicon glosses per unit file (letters left out). */
function lexiconByUnit(base: string): Map<string, Gloss[]> {
  const out = new Map<string, Gloss[]>();
  const dir = path.join(base, "lexicon");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const d = readJson(path.join(dir, f)) as { unit?: unknown; entries?: LexEntry[] } | undefined;
    const unit = typeof d?.unit === "string" ? d.unit : f.replace(/\.json$/, "");
    const list: Gloss[] = [];
    for (const e of Array.isArray(d?.entries) ? d.entries : []) {
      if (!isStr(e?.id) || !isStr(e?.bn) || !isStr(e?.tr) || !isStr(e?.en) || e.pos === "letter") continue;
      list.push({
        id: e.id,
        bn: e.bn.normalize("NFC"),
        tr: e.tr,
        en: e.en,
        ...(Array.isArray(e.alt) && e.alt.every(isStr) && e.alt.length ? { alt: e.alt as string[] } : {}),
        ...(isStr(e.pos) ? { pos: e.pos } : {}),
        ...(isStr(e.notes) ? { notes: e.notes } : {}),
      });
    }
    out.set(unit, list);
  }
  return out;
}

function parseQuestion(q: unknown, lineCount: number): StoryQuestion | null {
  const x = q as Record<string, unknown> | null;
  if (!x || !Number.isInteger(x.after) || (x.after as number) < 0 || (x.after as number) >= lineCount) return null;
  if (!isStr(x.question) || !isStr(x.why) || !Array.isArray(x.options) || x.options.length < 2) return null;
  const options: StoryOption[] = [];
  for (const o of x.options) {
    if (isStr(o)) options.push({ text: o });
    else if (isBn(o)) options.push({ text: o.bn.normalize("NFC"), bn: bnOf(o) });
    else return null;
  }
  if (!Number.isInteger(x.answer) || (x.answer as number) < 0 || (x.answer as number) >= options.length) return null;
  return {
    after: x.after as number,
    question: x.question,
    ...(isBn(x.questionBn) ? { questionBn: bnOf(x.questionBn) } : {}),
    options,
    answer: x.answer as number,
    why: x.why,
  };
}

let cached: Story[] | undefined;

/** Every loadable story, in course order. */
export function getStories(base = getContentBaseDir()): Story[] {
  if (cached && base === getContentBaseDir()) return cached;
  const course = getCourse();
  const lex = lexiconByUnit(base);
  const dir = path.join(base, "stories");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const raw = new Map<string, Record<string, unknown>>();
  for (const f of files) {
    const d = readJson(path.join(dir, f)) as Record<string, unknown> | undefined;
    if (d && typeof d.unit === "string") raw.set(d.unit, d);
    else console.warn(`[stories] could not read ${f}; skipping`);
  }

  const out: Story[] = [];
  const taught: Gloss[] = [];
  let mainNumber = 0;
  for (const u of course.units) {
    taught.push(...(lex.get(u.id) ?? []));
    if (u.track === "main") mainNumber++;
    const d = raw.get(u.id);
    if (!d) continue;
    const id = typeof d.id === "string" ? d.id : `${u.id}-story`;
    const lines: unknown[] = Array.isArray(d.lines) ? d.lines : [];
    if (!isBn(d.title) || !lines.length || !lines.every((l) => isBn(l) && ((l as { speaker?: unknown }).speaker === undefined || isStr((l as { speaker?: unknown }).speaker)))) {
      console.warn(`[stories] ${id} does not match the schema; skipping`);
      continue;
    }
    const idx: FormIndex = buildFormIndex(taught);
    const questions = (Array.isArray(d.questions) ? d.questions : []).map((q) => parseQuestion(q, lines.length));
    if (questions.some((q) => q === null)) {
      console.warn(`[stories] ${id} has a malformed question; skipping`);
      continue;
    }
    out.push({
      id,
      unit: u.id,
      unitTitle: u.title,
      unitNumber: mainNumber,
      firstLessonId: u.lessons[0]?.id ?? null,
      title: bnOf(d.title as StoryBnText),
      ...(isStr(d.summary) ? { summary: d.summary } : {}),
      draft: d.status !== "reviewed",
      lines: (lines as (StoryBnText & { speaker?: string; senses?: unknown })[]).map((l) => ({
        ...(l.speaker ? { speaker: l.speaker } : {}),
        ...bnOf(l),
        words: segmentLine(l.bn, idx, sensesOf(l.senses)),
      })),
      questions: (questions as StoryQuestion[]).sort((a, b) => a.after - b.after),
    });
  }
  if (base === getContentBaseDir()) cached = out;
  return out;
}

export function getStory(id: string): Story | undefined {
  return getStories().find((s) => s.id === id);
}

export function getStorySummaries(): StorySummary[] {
  return getStories().map(({ lines, questions, ...rest }) => ({ ...rest, lineCount: lines.length, questionCount: questions.length }));
}
