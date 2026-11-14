// Which lexicon words does an exercise test? Pure, no React/DOM.
//
// The lesson player only gives us (lessonId, exercise, correct), so we resolve
// Bengali text against a compact WordIndex built from content on the server
// (see catalog.ts and /practice/word-index.json).
//
//   - Generated review exercises carry the word id in their own id:
//     "<lessonId>:rv~<n>~<wordId>" (the player reports practice items under the
//     part before the first ":", so the word id survives either way).
//   - Otherwise the tested strings are: prompt.bn (select/type/word bank),
//     audio.bn (listen), every pair's bn (match pairs), glyph (script).
//   - A string that is itself a lexicon entry maps to that entry. A sentence is
//     scanned token by token for lexicon entries (multi-word entries match as
//     contiguous runs; longest match wins).
//   - Homographs (same spelling, several ids) prefer the lesson's own vocab.
//
// Example (index has আমি=ami, ভালো=bhalo, আছি=achhi; lesson vocab [achhi]):
//   targetsFor(index, "u02-l03", {type:"word_bank", prompt:{bn:"আমি ভালো আছি।"...}})
//     -> [{ id:"ami", own:false }, { id:"bhalo", own:false }, { id:"achhi", own:true }]
//   targetsFor(index, "u01-l01", {id:"rv~3~dhonnobad", ...}) -> [{ id:"dhonnobad", own:true }]
import type { Exercise } from "../types";
import { gradeFor, type Grade } from "./scheduler";

export interface WordIndex {
  /** [id, bn] for every word taught by some lesson. */
  entries: [string, string][];
  /** lessonId -> vocab ids taught in that lesson. */
  lessons: Record<string, string[]>;
}

export interface Target {
  id: string;
  /** True if the word is in the current lesson's vocab (or is an explicit review target). */
  own: boolean;
}

export interface ResolvedIndex {
  whole: Map<string, string[]>;
  /** first token -> entries starting with it, longest first */
  byFirst: Map<string, { tokens: string[]; ids: string[] }[]>;
  lessons: Map<string, Set<string>>;
  ids: Set<string>;
}

const EDGE = /^[\s।॥?!,.;:"“”‘’'()\-–—…]+|[\s।॥?!,.;:"“”‘’'()\-–—…]+$/g;

export function canonBn(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").replace(EDGE, "");
}

function tokens(s: string): string[] {
  return canonBn(s)
    .split(" ")
    .map((t) => t.replace(EDGE, ""))
    .filter(Boolean);
}

export function resolveIndex(index: WordIndex): ResolvedIndex {
  const whole = new Map<string, string[]>();
  const byFirst = new Map<string, { tokens: string[]; ids: string[] }[]>();
  const ids = new Set<string>();
  for (const [id, bn] of index.entries) {
    if (typeof id !== "string" || typeof bn !== "string") continue;
    ids.add(id);
    const key = canonBn(bn);
    if (!key) continue;
    const list = whole.get(key);
    if (list) {
      if (!list.includes(id)) list.push(id);
      continue;
    }
    const entry = { tokens: tokens(bn), ids: [id] };
    whole.set(key, entry.ids);
    const first = entry.tokens[0];
    const bucket = byFirst.get(first) ?? [];
    bucket.push(entry);
    byFirst.set(first, bucket);
  }
  for (const bucket of byFirst.values()) bucket.sort((a, b) => b.tokens.length - a.tokens.length);
  const lessons = new Map<string, Set<string>>();
  for (const [l, v] of Object.entries(index.lessons ?? {})) {
    if (Array.isArray(v)) lessons.set(l, new Set(v));
  }
  return { whole, byFirst, lessons, ids };
}

const REVIEW_RE = /(?:^|:)rv~\d+~(.+)$/;

/**
 * Id for a generated review exercise that tests `word` (taught in `lessonId`).
 * reviewExerciseId(3, "dhonnobad", "u01-l01") -> "u01-l01:rv~3~dhonnobad"
 */
export function reviewExerciseId(n: number, wordId: string, lessonId = "practice"): string {
  return `${lessonId}:rv~${n}~${wordId}`;
}

/**
 * The word id encoded in a generated review exercise id, with or without the
 * lesson prefix: "u01-l01:rv~3~na" -> "na", "rv~3~na" -> "na", "e01" -> undefined.
 */
export function reviewWordId(exerciseId: string): string | undefined {
  return REVIEW_RE.exec(exerciseId)?.[1];
}

/** Bengali strings an exercise tests (before lookup). */
export function testedStrings(ex: Exercise): string[] {
  switch (ex.type) {
    case "select_translation":
    case "type_translation":
    case "word_bank":
      return [ex.prompt?.bn].filter((s): s is string => typeof s === "string");
    case "listen_select":
      return [ex.audio?.bn].filter((s): s is string => typeof s === "string");
    case "match_pairs":
      return (ex.pairs ?? []).map((p) => p?.bn).filter((s): s is string => typeof s === "string");
    case "script_recognize":
      return typeof ex.glyph === "string" ? [ex.glyph] : [];
    default:
      return [];
  }
}

function pick(ids: string[], own: Set<string> | undefined): Target {
  const mine = own ? ids.find((id) => own.has(id)) : undefined;
  return { id: mine ?? ids[0], own: mine !== undefined };
}

/** Lexicon words found in one Bengali string. */
export function wordsInText(idx: ResolvedIndex, text: string, own?: Set<string>): Target[] {
  const direct = idx.whole.get(canonBn(text));
  if (direct) return [pick(direct, own)];
  const toks = tokens(text);
  const out: Target[] = [];
  for (let i = 0; i < toks.length; ) {
    const bucket = idx.byFirst.get(toks[i]);
    const hit = bucket?.find((e) => e.tokens.every((t, k) => toks[i + k] === t));
    if (hit) {
      out.push(pick(hit.ids, own));
      i += hit.tokens.length;
    } else i += 1;
  }
  return out;
}

/** All distinct words an exercise tests, in order of appearance. */
export function targetsFor(idx: ResolvedIndex, lessonId: string, ex: Exercise): Target[] {
  const explicit = reviewWordId(ex.id ?? "");
  if (explicit) return idx.ids.has(explicit) || idx.ids.size === 0 ? [{ id: explicit, own: true }] : [];
  const own = idx.lessons.get(lessonId);
  const seen = new Map<string, Target>();
  for (const s of testedStrings(ex)) {
    for (const t of wordsInText(idx, s, own)) {
      const prev = seen.get(t.id);
      if (!prev) seen.set(t.id, t);
      else if (t.own) prev.own = true;
    }
  }
  return [...seen.values()];
}

/**
 * Grades to apply for one checked answer.
 * Correct: every tested word gets "good".
 * Wrong: if the exercise tested a single word, it gets "again". In a sentence,
 * blame only the lesson's own words when there are any (a mistake in a
 * sentence about "my brother" says little about "I"), else every word.
 */
export function gradesFor(targets: Target[], correct: boolean): { id: string; grade: Grade }[] {
  if (correct || targets.length <= 1) return targets.map((t) => ({ id: t.id, grade: gradeFor(correct) }));
  const own = targets.filter((t) => t.own);
  return (own.length ? own : targets).map((t) => ({ id: t.id, grade: "again" as const }));
}
