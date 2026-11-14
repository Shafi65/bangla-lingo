// Helpers for the `fill_blank` exercise: find the blank inside the sentence,
// split the sentence around it, and mask its transliteration. Pure, no DOM.
// The content validator (content/scripts/validate.mjs) mirrors the occurrence rule.

/** Characters that end a token inside a Bengali sentence. */
const BOUNDARY = /[\s।॥?!,.;:"“”'‘’()—–]/;
const EDGE = /^[।॥?!,.;:"“”'‘’()—–]+|[।॥?!,.;:"“”'‘’()—–]+$/g;

const nfc = (s: string) => s.normalize("NFC");

/** Start indexes of every whole-token-sequence occurrence of `blank` in `sentence` (both NFC). */
export function blankPositions(sentence: string, blank: string): number[] {
  const s = nfc(sentence);
  const b = nfc(blank).trim().replace(/\s+/g, " ");
  if (!b) return [];
  const out: number[] = [];
  for (let i = s.indexOf(b); i >= 0; i = s.indexOf(b, i + 1)) {
    const before = i === 0 ? "" : s[i - 1];
    const after = i + b.length >= s.length ? "" : s[i + b.length];
    if ((!before || BOUNDARY.test(before)) && (!after || BOUNDARY.test(after))) out.push(i);
  }
  return out;
}

export interface BlankSplit {
  before: string;
  after: string;
}

/** The sentence around the single blank, or null if the blank does not occur exactly once. */
export function splitAtBlank(sentence: string, blank: string): BlankSplit | null {
  const pos = blankPositions(sentence, blank);
  if (pos.length !== 1) return null;
  const s = nfc(sentence);
  const len = nfc(blank).trim().replace(/\s+/g, " ").length;
  return { before: s.slice(0, pos[0]), after: s.slice(pos[0] + len) };
}

/** Placeholder shown in transliteration where the blank word would be. */
export const TR_GAP = "___";

/**
 * Transliteration of the sentence with the blank's romanisation replaced by a
 * gap, or null when it cannot be done safely (the Bengali and transliteration
 * words do not line up one to one), in which case callers hide it until checked.
 */
export function maskedTranslit(sentence: { bn: string; tr: string }, blank: string): string | null {
  const bnWords = nfc(sentence.bn).split(/\s+/).filter(Boolean);
  const trWords = sentence.tr.normalize("NFC").split(/\s+/).filter(Boolean);
  if (bnWords.length !== trWords.length) return null;
  const want = nfc(blank).trim().split(/\s+/).filter(Boolean);
  const stripped = bnWords.map((w) => w.replace(EDGE, ""));
  const hits: number[] = [];
  for (let i = 0; i + want.length <= stripped.length; i++) {
    if (want.every((w, k) => stripped[i + k] === w)) hits.push(i);
  }
  if (hits.length !== 1) return null;
  const first = hits[0];
  const last = first + want.length - 1;
  const lead = /^[\s"“'‘(]*/.exec(trWords[first])?.[0] ?? "";
  const tail = /[\s.,;:!?"”'’)]*$/.exec(trWords[last])?.[0] ?? "";
  const out = [...trWords.slice(0, first), `${lead}${TR_GAP}${tail}`, ...trWords.slice(last + 1)];
  return out.join(" ");
}
