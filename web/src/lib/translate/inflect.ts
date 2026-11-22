// Pure: word-form helpers for the course search.
//   - Bengali: strip the common case, plural and "the" endings so ভাতটা finds ভাত.
//   - English: map plurals and -ing / -ed forms back to a base word so "drinking" finds "drink".

export interface BengaliSuffix {
  /** The ending as written. */
  s: string;
  /** Learner-facing meaning, shown as "-টা 'the'". */
  gloss: string;
}

/** Longest first, so "দের" is tried before "র" and "গুলো" before "ো". */
export const BENGALI_SUFFIXES: readonly BengaliSuffix[] = [
  { s: "গুলোকে", gloss: "the (plural), to" },
  { s: "গুলো", gloss: "the (plural)" },
  { s: "গুলি", gloss: "the (plural)" },
  { s: "দের", gloss: "of / to (plural)" },
  { s: "ের", gloss: "of (-er)" },
  { s: "এর", gloss: "of (-er)" },
  { s: "কে", gloss: "to / object marker" },
  { s: "রা", gloss: "plural (people)" },
  { s: "তে", gloss: "in / at" },
  { s: "টা", gloss: "the" },
  { s: "টি", gloss: "the" },
  { s: "য়", gloss: "in / at" },
  { s: "র", gloss: "of" },
  { s: "ে", gloss: "in / at" },
];

export interface BengaliSplit {
  base: string;
  /** Endings removed, in the order they appear in the word. */
  suffixes: BengaliSuffix[];
}

/**
 * Candidate (base, endings) splits for an unknown Bengali word, shortest removal first, up to two
 * endings deep ("ভাতটাকে" = ভাত + -টা + -কে). The caller checks which base is a real course word.
 */
export function bengaliSplits(word: string): BengaliSplit[] {
  const w = word.normalize("NFC");
  const out: BengaliSplit[] = [];
  const seen = new Set<string>();
  const walk = (cur: string, sfx: BengaliSuffix[], depth: number) => {
    for (const sf of BENGALI_SUFFIXES) {
      if (!cur.endsWith(sf.s) || cur.length - sf.s.length < 1) continue;
      const base = cur.slice(0, cur.length - sf.s.length);
      const suffixes = [sf, ...sfx];
      const key = base + "|" + suffixes.map((x) => x.s).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ base, suffixes });
      if (depth < 2) walk(base, suffixes, depth + 1);
    }
  };
  walk(w, [], 1);
  // Fewer endings first, then the longer remaining base.
  return out.sort((a, b) => a.suffixes.length - b.suffixes.length || b.base.length - a.base.length);
}

/** Human note for a split: "ভাতটা → ভাত + -টা 'the'". */
export function describeSplit(word: string, split: BengaliSplit): string {
  const parts = split.suffixes.map((x) => `-${x.s} '${x.gloss}'`).join(" + ");
  return `${word} → ${split.base} + ${parts}`;
}

const VOWELS = /[aeiou]/;

/**
 * Possible base forms of an English word (lowercase, letters only): plurals, -ing and -ed. The
 * caller checks which candidate is really in the course. Most likely candidates come first.
 */
export function englishStems(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  const add = (x: string) => {
    if (x.length >= 2 && x !== w && !out.includes(x)) out.push(x);
  };
  if (w.length > 3 && w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.length > 3 && /(ches|shes|sses|xes|zes|oes)$/.test(w)) add(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    if (VOWELS.test(stem)) {
      add(stem);
      add(stem + "e");
      if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
    }
  }
  if (w.length > 3 && w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.length > 3 && w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    if (VOWELS.test(stem)) {
      add(stem);
      add(stem + "e");
      if (/([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1));
    }
  }
  return out;
}
