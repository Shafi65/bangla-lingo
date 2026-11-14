// Build a review session from word data. Pure; randomness comes from `rand`.
//
// Selection (pickWords):
//   "due"      words whose record is due, most overdue first (ties: lower stability);
//              if fewer than MIN_ITEMS are due, topped up with the weakest other
//              learned words (lowest recall probability first).
//   "weak"     learned words by recall probability, lowest first.
//   "mistakes" the given ids (the mistakes notebook), in order.
// Each picked word becomes one exercise; small pools repeat words in a second form
// so a session has MIN_ITEMS..MAX_ITEMS items when the course allows it.
//
// Forms (formFor):
//   letters: script_recognize (glyph -> sound) or listen_select (sound -> glyph)
//   words:   select bn->en, select en->bn, listen_select; plus type_translation
//            (English prompt, type the Bengali or its transliteration) once the
//            word is well known (stability >= 4 days and >= 3 reviews).
//
// Distractors (distractorsFor): other words of the same kind (word/letter),
// learned ones first and same-unit ones preferred, never sharing the target's
// Bengali, transliteration or English meaning (compared without parentheses),
// and distinct from each other, so exactly one option is correct.
//
// Example: buildSession({ words, memory, learned, mode: "due", now, rand: mulberry32(1) })
//   -> { lesson: { id: "practice", exercises: [ {id:"u01-l01:rv~0~na", type:"select_translation", ...}, ... ] },
//        wordIds: ["na", ...] }
import type { Exercise, Lesson } from "../types";
import { retrievability, type WordRecord } from "./scheduler";
import type { WordMemoryState } from "./state";
import { reviewExerciseId } from "./targets";
import type { ReviewWord } from "./types";

export const MIN_ITEMS = 10;
export const MAX_ITEMS = 15;

export type SessionMode = "due" | "weak" | "mistakes";
export type Rand = () => number;

/** Small deterministic PRNG for tests / reproducible sessions. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** English meaning for comparison: lowercase, parentheses dropped. "yes (polite)" -> "yes". */
export function coreMeaning(en: string): string {
  return en
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}/ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trKey(tr: string): string {
  return tr.toLowerCase().replace(/[^a-z]/g, "");
}

function bnKey(bn: string): string {
  return bn.normalize("NFC").replace(/[\s।॥?!,.]/g, "");
}

/** True if a and b could be confused as answers (same form, sound or meaning). */
export function clashes(a: ReviewWord, b: ReviewWord): boolean {
  if (a.id === b.id || bnKey(a.bn) === bnKey(b.bn) || trKey(a.tr) === trKey(b.tr)) return true;
  if (a.letter || b.letter) return false; // letters: meaning text is a description, sound decides
  const ma = coreMeaning(a.en);
  const mb = coreMeaning(b.en);
  if (!ma || !mb || ma === mb) return true;
  // "many / a lot" vs "a lot": any shared slash-alternative counts as the same meaning
  const sa = new Set(ma.split("/").map((x) => x.trim()));
  return mb.split("/").some((x) => sa.has(x.trim()));
}

export function distractorsFor(
  target: ReviewWord,
  learned: readonly ReviewWord[],
  all: readonly ReviewWord[],
  n: number,
  rand: Rand,
): ReviewWord[] {
  const out: ReviewWord[] = [];
  const consider = (pool: readonly ReviewWord[]) => {
    const ranked = shuffle(
      pool.filter((w) => w.letter === target.letter),
      rand,
    ).sort((a, b) => Number(b.unit === target.unit) - Number(a.unit === target.unit));
    for (const w of ranked) {
      if (out.length >= n) return;
      if (clashes(w, target) || out.some((o) => clashes(o, w))) continue;
      out.push(w);
    }
  };
  consider(learned);
  if (out.length < n) consider(all); // tiny vocabularies: borrow from the course
  return out;
}

export type Form = "bn_to_en" | "en_to_bn" | "listen" | "type" | "glyph";

export function isWellKnown(rec: WordRecord | undefined): boolean {
  return !!rec && rec.stability >= 4 && rec.reps >= 3;
}

export function formFor(word: ReviewWord, rec: WordRecord | undefined, rand: Rand, avoid?: Form): Form {
  const forms: Form[] = word.letter
    ? ["glyph", "glyph", "listen"]
    : isWellKnown(rec)
      ? ["type", "type", "en_to_bn", "bn_to_en", "listen"]
      : ["bn_to_en", "en_to_bn", "listen"];
  const choices = forms.filter((f) => f !== avoid);
  return (choices.length ? choices : forms)[Math.floor(rand() * (choices.length || forms.length))];
}

/** Build one exercise; undefined if there are too few distractors. */
export function makeExercise(
  n: number,
  word: ReviewWord,
  form: Form,
  learned: readonly ReviewWord[],
  all: readonly ReviewWord[],
  rand: Rand,
): Exercise | undefined {
  const id = reviewExerciseId(n, word.id, word.lesson);
  const prompt = { bn: word.bn, tr: word.tr, en: word.en };
  if (form === "type") {
    // Accept any learned word with exactly the same English, in script or transliteration.
    const same = learned.filter((w) => !w.letter && coreMeaning(w.en) === coreMeaning(word.en));
    const accepted = [...new Set([word, ...same].flatMap((w) => [w.bn, w.tr, w.tr.replace(/~/g, "")]))];
    return { id, type: "type_translation", prompt, direction: "en_to_bn", accepted };
  }
  const ds = distractorsFor(word, learned, all, 3, rand);
  if (ds.length < 2) return undefined;
  const opts = shuffle([word, ...ds], rand);
  const answer = opts.indexOf(word);
  switch (form) {
    case "bn_to_en":
      return { id, type: "select_translation", prompt, direction: "bn_to_en", options: opts.map((w) => w.en), answer };
    case "en_to_bn":
      return { id, type: "select_translation", prompt, direction: "en_to_bn", options: opts.map((w) => w.bn), answer };
    case "listen":
      return { id, type: "listen_select", audio: prompt, options: opts.map((w) => w.bn), answer };
    case "glyph":
      return { id, type: "script_recognize", glyph: word.bn, options: opts.map((w) => w.tr), answer };
  }
}

export interface SessionInput {
  /** Every reviewable word in the course. */
  words: readonly ReviewWord[];
  memory: WordMemoryState;
  /** Ids the learner has met (record exists or teaching lesson completed). */
  learned: ReadonlySet<string>;
  mode: SessionMode;
  now: number;
  rand: Rand;
  /** For "mistakes": the ids to practise. */
  ids?: readonly string[];
}

export function pickWords(input: SessionInput): ReviewWord[] {
  const { words, memory, learned, mode, now } = input;
  const byId = new Map(words.map((w) => [w.id, w]));
  const known = words.filter((w) => learned.has(w.id));
  const weakest = () =>
    [...known].sort(
      (a, b) =>
        retrievability(memory.words[a.id], now) - retrievability(memory.words[b.id], now) ||
        (memory.words[a.id]?.stability ?? 0) - (memory.words[b.id]?.stability ?? 0),
    );
  if (mode === "mistakes") {
    return (input.ids ?? []).map((id) => byId.get(id)).filter((w): w is ReviewWord => !!w).slice(0, MAX_ITEMS);
  }
  if (mode === "weak") return weakest().slice(0, MIN_ITEMS);
  const due = known
    .filter((w) => {
      const r = memory.words[w.id];
      return r && r.due <= now;
    })
    .sort((a, b) => memory.words[a.id].due - memory.words[b.id].due || memory.words[a.id].stability - memory.words[b.id].stability)
    .slice(0, MAX_ITEMS);
  if (due.length >= MIN_ITEMS) return due;
  const have = new Set(due.map((w) => w.id));
  return [...due, ...weakest().filter((w) => !have.has(w.id))].slice(0, Math.max(due.length, MIN_ITEMS));
}

export function buildSession(input: SessionInput): { lesson: Lesson; wordIds: string[] } {
  const { words, memory, learned, rand } = input;
  const picked = pickWords(input);
  const known = words.filter((w) => learned.has(w.id));
  const items: { word: ReviewWord; form: Form }[] = [];
  const lastForm = new Map<string, Form>();
  const add = (word: ReviewWord) => {
    const prev = items[items.length - 1]?.form;
    const form = formFor(word, memory.words[word.id], rand, lastForm.get(word.id) ?? prev);
    lastForm.set(word.id, form);
    items.push({ word, form });
  };
  picked.forEach(add);
  // Small pools: a second pass in a different form, up to MIN_ITEMS.
  for (let i = 0; items.length < MIN_ITEMS && i < picked.length; i++) add(picked[i]);

  // Spread repeats apart: first pass order, then second pass.
  const exercises: Exercise[] = [];
  items.forEach(({ word, form }, n) => {
    const ex = makeExercise(n, word, form, known, words, rand) ?? makeExercise(n, word, "type", known, words, rand);
    if (ex && !(word.letter && ex.type === "type_translation")) exercises.push(ex);
  });
  return {
    lesson: { id: "practice", unit: "practice", title: "Word review", vocab: [], exercises },
    wordIds: [...new Set(picked.map((w) => w.id))],
  };
}

/** bn -> tr for the Bengali options in a session (for the options' transliteration). */
export function sessionTranslit(words: readonly ReviewWord[], lesson: Lesson): Record<string, string> {
  const byBn = new Map<string, string>();
  for (const w of words) if (!byBn.has(w.bn.normalize("NFC"))) byBn.set(w.bn.normalize("NFC"), w.tr);
  const out: Record<string, string> = {};
  for (const ex of lesson.exercises) {
    const opts =
      ex.type === "listen_select" || (ex.type === "select_translation" && ex.direction === "en_to_bn") ? ex.options : [];
    for (const o of opts) {
      const k = o.normalize("NFC");
      const tr = byBn.get(k);
      if (tr) out[k] = tr;
    }
  }
  return out;
}
