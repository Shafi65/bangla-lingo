// Pure: split a story line into tappable words with glosses.
//
// Greedy longest match over the line's words against the lexicon forms taught so far, the same
// rule as content/scripts/validate-stories.mjs, so a story that validates has a gloss on every
// word. A word that still isn't found is retried without common endings (ভাতটা -> ভাত), reusing the
// Translate page's inflection helpers.
import { bengaliSplits, describeSplit } from "../translate/inflect";
import type { Gloss, StoryWord } from "./types";

const PUNCT = /[।॥?!,.;:"“”'‘’()—–…/]/g;
const EDGE_START = /^[।॥?!,.;:"“”'‘’()—–…/]+/;
const EDGE_END = /[।॥?!,.;:"“”'‘’()—–…/]+$/;

/** Lookup key: NFC, punctuation removed, words joined by one space. */
export const formKey = (s: string): string =>
  s.normalize("NFC").replace(PUNCT, " ").split(/\s+/).filter(Boolean).join(" ");

export interface FormIndex {
  forms: Map<string, Gloss[]>;
  maxWords: number;
}

export function buildFormIndex(entries: readonly Gloss[]): FormIndex {
  const forms = new Map<string, Gloss[]>();
  let maxWords = 1;
  for (const e of entries) {
    const key = formKey(e.bn);
    if (!key) continue;
    const list = forms.get(key) ?? [];
    if (!list.some((g) => g.id === e.id)) list.push(e);
    forms.set(key, list);
    maxWords = Math.max(maxWords, key.split(" ").length);
  }
  return { forms, maxWords };
}

interface RawToken {
  pre: string;
  core: string;
  post: string;
}

function rawTokens(line: string): RawToken[] {
  const out: RawToken[] = [];
  for (const t of line.normalize("NFC").split(/\s+/).filter(Boolean)) {
    const pre = t.match(EDGE_START)?.[0] ?? "";
    const rest = t.slice(pre.length);
    const post = rest.match(EDGE_END)?.[0] ?? "";
    const core = rest.slice(0, rest.length - post.length);
    if (!core) {
      // punctuation on its own ("…"): glue to the previous word
      if (out.length) out[out.length - 1].post += ` ${t}`;
      continue;
    }
    out.push({ pre, core, post });
  }
  return out;
}

function pick(glosses: Gloss[], key: string, senses?: Readonly<Record<string, string>>): Gloss[] {
  if (glosses.length < 2) return glosses;
  const id = senses && Object.entries(senses).find(([bn]) => formKey(bn) === key)?.[1];
  const chosen = id ? glosses.filter((g) => g.id === id) : [];
  return chosen.length ? chosen : glosses;
}

function viaEndings(word: string, idx: FormIndex): Gloss[] {
  for (const split of bengaliSplits(word)) {
    const hit = idx.forms.get(split.base);
    if (hit?.length) return hit.map((g) => ({ ...g, via: describeSplit(word, split) }));
  }
  return [];
}

/** Words of a line, in order, with their glosses. */
export function segmentLine(bn: string, idx: FormIndex, senses?: Readonly<Record<string, string>>): StoryWord[] {
  const toks = rawTokens(bn);
  const out: StoryWord[] = [];
  for (let i = 0; i < toks.length; ) {
    let n = 0;
    let glosses: Gloss[] = [];
    let key = "";
    for (let k = Math.min(idx.maxWords, toks.length - i); k >= 1; k--) {
      const cand = toks
        .slice(i, i + k)
        .map((t) => t.core)
        .join(" ");
      const hit = idx.forms.get(cand);
      if (hit?.length) {
        n = k;
        glosses = hit;
        key = cand;
        break;
      }
    }
    if (!n) {
      n = 1;
      key = toks[i].core;
      glosses = viaEndings(key, idx);
    }
    const part = toks.slice(i, i + n);
    const text = part
      .map((t, j) => (j === 0 ? "" : t.pre) + t.core + (j === part.length - 1 ? "" : t.post))
      .join(" ");
    out.push({ pre: part[0].pre, text, post: part[part.length - 1].post, glosses: pick(glosses, key, senses) });
    i += n;
  }
  return out;
}
