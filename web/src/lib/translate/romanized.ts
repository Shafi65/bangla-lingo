// Pure: is this Latin-script text romanized Bengali ("ami bhat khai") rather than English?
//
// The check is deliberately conservative: a wrong "yes" sends English through the Bengali path and
// shows nonsense, while a wrong "no" only costs the learner one tap on the direction chip.
//
// Each word is placed in one bucket:
//   english  a common English word, or a word from the course's English glosses. English wins ties,
//            so "bad" and "pain" (which are also Bengali romanizations) count as English.
//   course   spelled like a course romanization (folded the same way search does)
//   shaped   not in the course, but shaped like a Bengali word: a verb or case ending such as
//            -chho, -chhe, -lam, -ben, -der, or the aspirated clusters bh/dh/chh/gh/jh/kh with at
//            least five letters
//   other    anything else
// and the text counts as romanized Bengali when
//   - at most a quarter of the words are English,
//   - at least 60% are course or shaped words, and
//   - it has at least one course word, or at least two shaped words and nothing English or unknown.
// So a lone "ami" or "dhonnobad" is read as Bengali (course words, not English words), a lone
// unknown word never is, and "ami want water" stays English. A learner can always override
// the guess with the direction chip or "It's English".
import { COMMON_ENGLISH } from "./english-words";
import { detectScript, normEn, normRoman, type Prepared } from "./search";

export type WordKind = "english" | "course" | "shaped" | "other";

export interface RomanizedVerdict {
  romanized: boolean;
  /** Words checked, with the bucket each fell in. */
  words: { w: string; kind: WordKind }[];
}

const STRONG_ENDINGS = /(chhi|chho|chhe|chhen|chi|cho|chen|lam|tam|ben|der|gulo)$/;
const CLUSTERS = /(bh|dh|chh|gh|jh|kh)/;

interface Vocab {
  roman: Set<string>;
  english: Set<string>;
}
const cache = new WeakMap<Prepared, Vocab>();

function vocab(px: Prepared): Vocab {
  let v = cache.get(px);
  if (v) return v;
  const roman = new Set<string>();
  const english = new Set<string>(COMMON_ENGLISH);
  const gloss = new Set<string>();
  for (const it of px.items) {
    for (const t of [it.tr, it.kt ?? ""]) {
      for (const w of normEn(t.replace(/~/g, "")).split(" ")) {
        const f = normRoman(w);
        if (f) roman.add(f);
      }
    }
    // English glosses of letters ("o as in 'or'") say nothing about English vocabulary.
    if (it.pos === "letter" || it.s) continue;
    for (const g of [it.en, ...(it.alt ?? [])]) for (const w of normEn(g).split(" ")) if (w.length > 1 || w === "a" || w === "i") gloss.add(w);
  }
  // A gloss word that is also a course romanization is a Bengali word used in English text ("panta
  // bhat"), not evidence of English. Words on the fixed list above stay English ("bad", "pain").
  for (const w of gloss) if (!roman.has(normRoman(w))) english.add(w);
  v = { roman, english };
  cache.set(px, v);
  return v;
}

/** The bucket for one lowercase Latin word. */
export function classifyWord(px: Prepared, w: string): WordKind {
  const { roman, english } = vocab(px);
  if (english.has(w)) return "english";
  if (roman.has(normRoman(w))) return "course";
  if (w.length >= 5 && STRONG_ENDINGS.test(w)) return "shaped";
  if (w.length >= 5 && CLUSTERS.test(w) && !/(ght|tion|ough|ness|ing|ed|ly)$/.test(w)) return "shaped";
  return "other";
}

export function detectRomanized(px: Prepared, text: string): RomanizedVerdict {
  const none: RomanizedVerdict = { romanized: false, words: [] };
  if (detectScript(text) !== "latin" || /[ঀ-৿]/.test(text)) return none;
  const toks = normEn(text).split(" ").filter((t) => /[a-z]/.test(t));
  if (toks.length === 0 || toks.length > 40) return none;
  const words = toks.map((w) => ({ w, kind: classifyWord(px, w) }));
  const n = words.length;
  const count = (k: WordKind) => words.filter((x) => x.kind === k).length;
  const e = count("english");
  const c = count("course");
  const s = count("shaped");
  const o = count("other");
  const ok =
    e / n <= 0.25 &&
    (c + s) / n >= 0.6 &&
    (c >= 1 || (s >= 2 && e === 0 && o === 0));
  return { romanized: ok, words };
}
