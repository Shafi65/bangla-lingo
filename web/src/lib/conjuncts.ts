// Pure: explain the conjuncts (যুক্তবর্ণ) in a Bengali word, e.g. ক্ষ = ক + ষ. Safe to import anywhere.
import { graphemes, normalizeBengali } from "./bnNormalize";

const HASANTA = "্";
const RA = "র";
const YA = "য";
/** Consonant letters, including ড় ঢ় য় precomposed and ৎ. */
const CONSONANT = /[ক-হৎড়ঢ়য়]/u;
/** Vowel signs and marks that can follow a conjunct inside one grapheme. */
const TRAILING_SIGNS = /[ঁ-ঃ়া-ৌৗ]+$/u;

/** How a consonant changes shape when it is the second part of a conjunct. */
const PHOLA: Record<string, { name: string; tr: string; how: string }> = {
  "য": { name: "য-ফলা", tr: "jo-fola", how: "য after a consonant becomes a small hook on the right" },
  "র": { name: "র-ফলা", tr: "ro-fola", how: "র after a consonant becomes a small stroke underneath" },
  "ব": { name: "ব-ফলা", tr: "bo-fola", how: "ব after a consonant becomes a small triangle on the right" },
  "ম": { name: "ম-ফলা", tr: "mo-fola", how: "ম after a consonant is written small on the right" },
  "ল": { name: "ল-ফলা", tr: "lo-fola", how: "ল after a consonant is written small underneath" },
};

/** Conjuncts whose shape does not show their parts clearly: worth learning as a whole. */
const OWN_SHAPE = new Set(["ক্ষ", "জ্ঞ", "হ্ম", "ক্ত", "ত্ত", "ত্র", "ষ্ণ", "ঞ্চ", "ঞ্জ", "ঙ্গ", "হ্ন", "শ্র"]);

export interface ConjunctPart {
  /** The conjunct on its own, without a following vowel sign (e.g. ন্য from ন্যা). */
  conjunct: string;
  /** Its consonants in order (ন, য). */
  letters: string[];
  /** Short notes on how the parts are written. */
  notes: string[];
}

/**
 * The distinct conjuncts in `word`, in order of first appearance. A র before another consonant
 * (রেফ, written as a stroke on top) also counts. Words without conjuncts give an empty list.
 */
export function explainConjuncts(word: string): ConjunctPart[] {
  const out: ConjunctPart[] = [];
  const seen = new Set<string>();
  // The zero-width joiner in র + ZWJ + ্য (ro + jo-fola, not reph) only changes the drawing; the parts are the same.
  for (const g of graphemes(normalizeBengali(word))) {
    const conjunct = g.replace(TRAILING_SIGNS, "");
    if (!conjunct.includes(HASANTA)) continue;
    const letters = conjunct.split(HASANTA).filter(Boolean);
    if (letters.length < 2 || !letters.every((l) => [...l].length === 1 && CONSONANT.test(l))) continue;
    if (seen.has(conjunct)) continue;
    seen.add(conjunct);
    const notes: string[] = [];
    if (letters[0] === RA && !word.includes(`${RA}\u200D${HASANTA}`)) {
      notes.push("রেফ (ref): র before a consonant is written as a small stroke on top");
    }
    for (const l of letters.slice(1)) {
      const p = PHOLA[l];
      if (p && !(l === YA && letters[0] === RA && notes.length)) notes.push(`${p.name} (${p.tr}): ${p.how}`);
    }
    if (OWN_SHAPE.has(conjunct)) notes.push("Has its own shape: learn it as a whole");
    out.push({ conjunct, letters, notes });
  }
  return out;
}
