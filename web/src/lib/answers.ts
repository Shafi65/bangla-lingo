import type { BnText, Exercise } from "./types";
import { graphemes, hasBengali, normalizeBengali } from "./bnNormalize";

/**
 * Normalize a typed/assembled answer for comparison:
 * Bengali normalisation (NFC, invisible joiners removed, khanda ta, doubled marks — see
 * bnNormalize.ts), lowercase, strip punctuation (incl. Bengali danda । and ॥), collapse whitespace.
 */
export function normalizeAnswer(s: string): string {
  return normalizeBengali(s)
    .toLowerCase()
    .replace(/['’‘`]/g, "") // don't -> dont
    .replace(/[\p{P}\p{S}।॥]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

/** The learner's response, shaped per exercise type. */
export type Response =
  | { kind: "index"; value: number }
  | { kind: "tiles"; value: number[] } // indices into exercise.tiles
  | { kind: "text"; value: string }
  | { kind: "matched" }; // match_pairs completed

/** Result of checking an answer. `typo` is the accepted spelling when it was right apart from a typo. */
export interface AnswerResult {
  correct: boolean;
  typo?: string;
}

/**
 * Check a response. Typed answers that are one small, harmless typo away from an accepted answer
 * count as correct, with the right spelling returned in `typo` so the feedback panel can show it.
 */
export function checkAnswer(ex: Exercise, r: Response): AnswerResult {
  if (checkExact(ex, r)) return { correct: true };
  if (r.kind === "text") {
    let candidates: string[] = [];
    let expects: Expects = "bn";
    if (ex.type === "type_translation") {
      candidates = ex.accepted;
      expects = ex.direction === "bn_to_en" ? "en" : "bn";
    } else if (ex.type === "fill_blank" && !ex.options) {
      candidates = [ex.blank, ...(ex.accepted ?? [])];
    }
    const hit = candidates.find((a) => isTypoOf(r.value, a, expects));
    if (hit !== undefined) return { correct: true, typo: hit };
  }
  return { correct: false };
}

/** True when the response is correct, exactly or with a forgiven typo. */
export function checkResponse(ex: Exercise, r: Response): boolean {
  return checkAnswer(ex, r).correct;
}

/** Language the learner is answering in: English, or Bengali (in script or romanized). */
export type Expects = "en" | "bn";

/**
 * Is `typed` the `target` answer with one forgivable typo? Same words except exactly one, and that
 * word must pass `isTypoWord`.
 */
export function isTypoOf(typed: string, target: string, expects: Expects): boolean {
  const t = normalizeAnswer(typed).split(" ");
  const a = normalizeAnswer(target).split(" ");
  if (t.length !== a.length || !a[0]) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    if (t[i] === a[i]) continue;
    if (++diffs > 1 || !isTypoWord(t[i], a[i], expects)) return false;
  }
  return diffs === 1;
}

/**
 * Bengali spelling confusions that never change grammar or meaning class. Endings and tense or
 * aspect markers sit inside Bengali words (দেখলাম / দেখছিলাম), so nothing else is forgiven.
 */
const BN_CONFUSABLE = ["িী", "ুূ", "শষস", "নণ", "জয", "ঙং"];

/**
 * One harmless typo in a single word. Deliberately strict: a forgiven grammar mistake teaches the
 * wrong thing, so anything that could be a different word or form is still marked wrong.
 *
 * - Bengali script: one swap between letters that learners confuse in spelling only (ি/ী, ু/ূ,
 *   শ/ষ/স, ন/ণ, জ/য, ঙ/ং), in a word of at least 3 graphemes.
 * - Romanized Bengali: nothing. Aspiration and doubled letters are meaningful (kotha "word" / kota
 *   "how many"), and accepted romanized spellings are already listed per exercise.
 * - English: one missing, extra or swapped-neighbour letter in a word of at least 5 letters, not at
 *   the first letter and not in the last two (eat/eats, liked/likes). Substituted letters are never
 *   forgiven: they usually make another word (bake/cake, wrote/write, women/woman).
 */
export function isTypoWord(typed: string, target: string, expects: Expects): boolean {
  if (!typed || typed === target || hasBengali(typed) !== hasBengali(target)) return false;
  if (hasBengali(target)) {
    if (expects !== "bn" || typed.length !== target.length || graphemes(target).length < 3) return false;
    const diff = [...target].flatMap((c, i) => (c === typed[i] ? [] : [i]));
    return diff.length === 1 && BN_CONFUSABLE.some((g) => g.includes(target[diff[0]]) && g.includes(typed[diff[0]]));
  }
  if (expects === "bn") return false;
  if (target.length < 5 || typed[0] !== target[0] || typed.slice(-2) !== target.slice(-2)) return false;
  return oneEditNoSubstitution(typed, target);
}

/** `a` and `b` differ by exactly one inserted, deleted, or swapped-neighbour letter. */
function oneEditNoSubstitution(a: string, b: string): boolean {
  if (a.length === b.length) {
    const diff = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.length !== short.length + 1) return false;
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  return long.slice(i + 1) === short.slice(i);
}

function checkExact(ex: Exercise, r: Response): boolean {
  switch (ex.type) {
    case "select_translation":
    case "listen_select":
    case "script_recognize":
    case "listen_meaning":
    case "reading":
      return r.kind === "index" && r.value === ex.answer;
    case "fill_blank":
      if (ex.options) return r.kind === "index" && r.value === ex.answer;
      // Typed: the blank itself is always accepted, plus the authored spellings.
      return r.kind === "text" && [ex.blank, ...(ex.accepted ?? [])].some((a) => answersMatch(a, r.value));
    case "word_bank":
      return (
        r.kind === "tiles" &&
        [ex.answer, ...(ex.alt ?? [])].some((seq) =>
          answersMatch(r.value.map((i) => ex.tiles[i]).join(" "), seq.join(" ")),
        )
      );
    case "type_translation":
      return (
        r.kind === "text" && ex.accepted.some((a) => answersMatch(a, r.value))
      );
    case "match_pairs":
      return r.kind === "matched";
  }
}

/** What to show in the feedback panel as the correct answer. */
export function solutionFor(
  ex: Exercise,
):
  | { text: BnText; display: string }
  | { glyph: string; sound: string }
  | { answer: string }
  | null {
  switch (ex.type) {
    case "select_translation":
      return {
        text: ex.prompt,
        display:
          ex.direction === "bn_to_en" ? ex.options[ex.answer] : ex.prompt.bn,
      };
    case "word_bank":
      return {
        text: ex.prompt,
        display:
          ex.direction === "bn_to_en" ? ex.answer.join(" ") : ex.prompt.bn,
      };
    case "type_translation":
      return {
        text: ex.prompt,
        display:
          ex.direction === "bn_to_en"
            ? (ex.accepted[0] ?? ex.prompt.en)
            : ex.prompt.bn,
      };
    case "listen_select":
      return { text: ex.audio, display: ex.options[ex.answer] ?? ex.audio.bn };
    case "fill_blank":
      // `display` is the missing word; the sentence is shown in full below it.
      return { text: ex.sentence, display: ex.blank };
    case "listen_meaning":
      return { text: ex.audio, display: ex.options[ex.answer] ?? ex.audio.en };
    case "reading":
      return { answer: ex.options[ex.answer] ?? "" };
    case "script_recognize":
      return { glyph: ex.glyph, sound: ex.options[ex.answer] };
    case "match_pairs":
      return null;
  }
}

/** Deterministic shuffle (stable between server and client render). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
