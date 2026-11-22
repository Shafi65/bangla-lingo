// Pure: a romanization for machine-produced Bengali, built word by word.
//
// Each word uses the course romanization when the course has the word (so it matches what the
// learner has been taught) and otherwise the transliteration the server got from Azure. The result
// is marked approximate whenever any word came from Azure.
import { normBn, type Prepared } from "./search";

export interface ComposedRoman {
  text: string;
  /** True when at least one word is not from the course. */
  approx: boolean;
}

/** The whitespace-separated words of `text`; the server's `roman` array lines up with these. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * `azure` has one entry per word of `splitWords(bn)` (or is missing). Returns null when some word
 * has no romanization from either source, so a gap is never shown as a guess.
 */
export function composeRoman(px: Prepared, bn: string, azure?: readonly string[] | null): ComposedRoman | null {
  const words = splitWords(bn);
  if (words.length === 0) return null;
  const usable = azure && azure.length === words.length ? azure : null;
  const out: string[] = [];
  let approx = false;
  for (let i = 0; i < words.length; i++) {
    const key = normBn(words[i]);
    if (!key) {
      // Punctuation on its own (such as a danda) adds nothing to read aloud.
      continue;
    }
    const course = px.words.get(key);
    if (course) {
      out.push(course);
      continue;
    }
    const a = usable?.[i]?.trim();
    if (!a) return null;
    out.push(a.replace(/[।॥]+/g, "").trim() || a);
    approx = true;
  }
  return out.length ? { text: out.join(" "), approx } : null;
}
