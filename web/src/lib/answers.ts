import type { BnText, Exercise } from "./types";

/**
 * Normalize a typed/assembled answer for comparison:
 * Unicode NFC, lowercase, strip punctuation (incl. Bengali danda । and ॥),
 * collapse whitespace.
 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFC")
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

export function checkResponse(ex: Exercise, r: Response): boolean {
  switch (ex.type) {
    case "select_translation":
    case "listen_select":
    case "script_recognize":
      return r.kind === "index" && r.value === ex.answer;
    case "word_bank":
      return (
        r.kind === "tiles" &&
        answersMatch(
          r.value.map((i) => ex.tiles[i]).join(" "),
          ex.answer.join(" "),
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
): { text: BnText; display: string } | { glyph: string; sound: string } | null {
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
