// Pure: on-device search over the course index for the Translate page. Safe anywhere.
//
// A query is compared with three kinds of key per item:
//   - English: the gloss, each `alt`, and the gloss without "(...)" asides or split at "/" and ";"
//     (lowercase, punctuation and accents removed)
//   - romanized Bengali: `tr` (and the Kolkata `tr`) folded so close spellings meet
//     ("dhonobad", "dhonnobad"; "sh"/"s", "ph"/"f", "z"/"j", "ee"/"i", "oo"/"u")
//   - Bengali script: NFC, punctuation removed
// and ranked by tier: 0 the whole key equals the query, 1 the query appears as whole words inside a
// key, 2 a key (or a word in it) starts with the query. Within a tier: taught words before assumed
// words before example sentences, letters last, the main gloss before alternatives, then the key
// closest in length to the query, then course order.
//
// When nothing matches, three rescues are tried (all on the device): Bengali endings are stripped
// (ভাতটা -> ভাত + -টা), English plurals / -ing / -ed forms go back to a base word (drinking -> drink),
// and small typos are forgiven ("Did you mean ..."), always ranked below real matches.
import { bengaliSplits, describeSplit, englishStems } from "./inflect";
import { typoDistance } from "./fuzzy";
import type { Lang, TItem } from "./types";

const BENGALI_CHAR = /[ঀ-৿]/g;
const LATIN_CHAR = /[A-Za-z]/g;

/** Which script the text is mostly written in. */
export function detectScript(text: string): "bn" | "latin" | "none" {
  const bn = text.match(BENGALI_CHAR)?.length ?? 0;
  const lat = text.match(LATIN_CHAR)?.length ?? 0;
  if (bn === 0 && lat === 0) return "none";
  return bn >= lat ? "bn" : "latin";
}

/** Source language implied by the script typed, or null when there is nothing to go on. */
export function detectLang(text: string): Lang | null {
  const s = detectScript(text);
  return s === "bn" ? "bn" : s === "latin" ? "en" : null;
}

/** English search form: lowercase, no accents, apostrophes dropped, other punctuation -> space. */
export function normEn(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Romanized-Bengali search form: normEn, then spelling variants folded together. */
export function normRoman(s: string): string {
  return normEn(s.replace(/~/g, ""))
    .replace(/[0-9]/g, "")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/ph/g, "f")
    .replace(/sh/g, "s")
    .replace(/z/g, "j")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bengali search form: NFC, punctuation (including । and ॥) -> space. */
export function normBn(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‌‍]/g, "")
    .replace(/[^ঀ-৿A-Za-z0-9]+/g, " ")
    .trim();
}

interface Key {
  k: string;
  /** Ranking penalty for matching through this key. */
  p: number;
}

export interface Prepared {
  items: readonly TItem[];
  en: Key[][];
  ro: Key[][];
  /** Unfolded romanization (normEn of tr), for an exact-spelling bonus. */
  roRaw: string[];
  bn: Key[][];
  /** Item penalty: assumed words, sentences, letters. */
  base: number[];
  /** Bengali word -> transliteration, from single-word items and aligned sentences. */
  words: Map<string, string>;
}

function enVariants(s: string): string[] {
  const out = new Set<string>();
  const add = (x: string) => {
    const n = normEn(x);
    if (n) out.add(n);
  };
  add(s);
  const bare = s.replace(/\([^)]*\)/g, " ");
  add(bare);
  for (const part of bare.split(/[/;]/)) add(part);
  return [...out];
}

export function prepare(items: readonly TItem[]): Prepared {
  const en: Key[][] = [];
  const ro: Key[][] = [];
  const roRaw: string[] = [];
  const bn: Key[][] = [];
  const base: number[] = [];
  const words = new Map<string, string>();

  for (const it of items) {
    const ek: Key[] = [];
    enVariants(it.en).forEach((k, i) => ek.push({ k, p: i === 0 ? 0 : 1 }));
    for (const a of it.alt ?? []) for (const k of enVariants(a)) ek.push({ k, p: 3 });
    en.push(ek);

    const rk: Key[] = [{ k: normRoman(it.tr), p: 0 }];
    if (it.kt) rk.push({ k: normRoman(it.kt), p: 4 });
    ro.push(rk.filter((x) => x.k));
    roRaw.push(normEn(it.tr.replace(/~/g, "")));

    const bk: Key[] = [{ k: normBn(it.bn), p: 0 }];
    if (it.kb) bk.push({ k: normBn(it.kb), p: 4 });
    bn.push(bk.filter((x) => x.k));

    base.push(it.s ? 20 : it.pos === "letter" ? 12 : it.a ? 5 : 0);

    // Word -> pronunciation map (first wins: taught words come first).
    const bt = normBn(it.bn).split(" ").filter(Boolean);
    const tt = it.tr
      .normalize("NFC")
      .split(/\s+/)
      .map((w) => w.replace(/^[^a-z~]+|[^a-z~]+$/gi, ""))
      .filter(Boolean);
    if (bt.length === tt.length) bt.forEach((w, i) => {
      if (!words.has(w)) words.set(w, tt[i]);
    });
  }
  return { items, en, ro, roRaw, bn, base, words };
}

/** Tier of key `k` for query `q` (both normalized), or -1 for no match. */
export function tierOf(k: string, q: string): number {
  if (!k || !q) return -1;
  if (k === q) return 0;
  const padded = ` ${k} `;
  if (padded.includes(` ${q} `)) return 1;
  if (k.startsWith(q) || padded.includes(` ${q}`)) return 2;
  return -1;
}

export type MatchVia = "en" | "tr" | "bn";

export interface Hit {
  /** Index into Prepared.items. */
  i: number;
  item: TItem;
  tier: number;
  via: MatchVia;
  score: number;
}

const TIER_W = 10_000;

function best(keys: Key[], q: string): { tier: number; p: number; len: number } | null {
  let out: { tier: number; p: number; len: number } | null = null;
  for (const { k, p } of keys) {
    const t = tierOf(k, q);
    if (t < 0) continue;
    const cand = { tier: t, p, len: Math.abs(k.length - q.length) };
    if (!out || t < out.tier || (t === out.tier && (p < out.p || (p === out.p && cand.len < out.len)))) out = cand;
  }
  return out;
}

function scoreOf(m: { tier: number; p: number; len: number }, base: number): number {
  return m.tier * TIER_W + (base + m.p) * 100 + Math.min(m.len, 99);
}

/** Every matching item, best first. `onlyWords` drops example sentences. */
export function matchAll(px: Prepared, query: string, { onlyWords = false } = {}): Hit[] {
  const script = detectScript(query);
  if (script === "none") return [];
  const hits: Hit[] = [];
  if (script === "bn") {
    const q = normBn(query);
    if (!q) return [];
    for (let i = 0; i < px.items.length; i++) {
      if (onlyWords && px.items[i].s) continue;
      const m = best(px.bn[i], q);
      if (m) hits.push({ i, item: px.items[i], tier: m.tier, via: "bn", score: scoreOf(m, px.base[i]) });
    }
  } else {
    const qe = normEn(query);
    const qr = normRoman(query);
    if (!qe) return [];
    for (let i = 0; i < px.items.length; i++) {
      if (onlyWords && px.items[i].s) continue;
      const me = best(px.en[i], qe);
      const mr = qr ? best(px.ro[i], qr) : null;
      let hit: Hit | null = null;
      if (me) hit = { i, item: px.items[i], tier: me.tier, via: "en", score: scoreOf(me, px.base[i]) };
      if (mr) {
        // Exact spelling of the course romanization ranks a hair above a folded match.
        const exact = px.roRaw[i] === qe ? 0 : 1;
        const s = scoreOf(mr, px.base[i]) + exact;
        if (!hit || s < hit.score) hit = { i, item: px.items[i], tier: mr.tier, via: "tr", score: s };
      }
      if (hit) hits.push(hit);
    }
  }
  return hits.sort((a, b) => a.score - b.score || a.i - b.i);
}

/** English words that rarely have a Bengali word of their own (articles, copulas, particles). */
const SKIP_WORDS = new Set(["a", "an", "the", "to", "of", "is", "are", "am", "be", "was", "were", "do", "does", "did", "and"]);

/** A near-miss: the query is within a typo or two of this item. */
export interface Suggestion {
  /** Index into Prepared.items. */
  i: number;
  item: TItem;
  via: "en" | "tr";
  /** What to show and search for: the matched English or romanized text. */
  label: string;
  /** Typos away (1 or 2). */
  distance: number;
  /** The whole phrase matched, not just one word of it. */
  whole: boolean;
}

export interface WordHit {
  word: string;
  hit?: Hit;
  /** How the word was reached when it isn't an exact match, e.g. "ভাতটা → ভাত + -টা 'the'". */
  note?: string;
  /** A close spelling, when the word isn't in the course. */
  suggestion?: Suggestion;
}

export type CourseResult =
  | { kind: "empty" }
  | {
      kind: "phrase";
      hits: Hit[];
      total: number;
      /** Set when the hits are for a base form of the word typed (ending stripped, plural undone). */
      note?: string;
      /** Close spellings, offered only when nothing matched. */
      suggestions?: Suggestion[];
    }
  | { kind: "words"; words: WordHit[] };

const wordsOf = (k: string) => k.split(" ").filter(Boolean);

/**
 * Items within a typo or two of the query (Damerau-Levenshtein: 1 for 4-7 letters, 2 for 8 or more,
 * none shorter), on English glosses and romanizations. Closest first, then taught words before
 * assumed words and sentences. Exact matches are not returned: use matchAll for those.
 */
export function suggest(px: Prepared, query: string, { onlyWords = false, limit = 3 } = {}): Suggestion[] {
  if (detectScript(query) !== "latin") return [];
  const qe = normEn(query);
  const qr = normRoman(query);
  const out: (Suggestion & { rank: number })[] = [];
  for (let i = 0; i < px.items.length; i++) {
    const item = px.items[i];
    if (onlyWords && item.s) continue;
    let best: Suggestion | null = null;
    const consider = (q: string, keys: Key[], via: "en" | "tr", raw: string) => {
      if (!q) return;
      for (const { k } of keys) {
        const cands = item.s ? [k] : [k, ...(k.includes(" ") ? wordsOf(k) : [])];
        for (const c of cands) {
          const d = typoDistance(q, c);
          if (d < 0) continue;
          const whole = c === k;
          if (!best || d < best.distance || (d === best.distance && whole && !best.whole)) {
            best = { i, item, via, label: via === "tr" && whole ? raw : c, distance: d, whole };
          }
        }
      }
    };
    consider(qe, px.en[i], "en", "");
    consider(qr, px.ro[i], "tr", item.tr.replace(/~/g, "").toLowerCase());
    const b = best as Suggestion | null;
    if (b) out.push({ ...b, rank: b.distance * 1000 + px.base[i] * 10 });
  }
  out.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const seen = new Set<string>();
  const res: Suggestion[] = [];
  for (const o of out) {
    if (seen.has(o.label)) continue;
    seen.add(o.label);
    res.push({ i: o.i, item: o.item, via: o.via, label: o.label, distance: o.distance, whole: o.whole });
    if (res.length >= limit) break;
  }
  return res;
}

/** Hits for a base form of `word` (an ending stripped, a plural undone), with a note saying how. */
function viaBase(px: Prepared, shown: string, key: string, script: "bn" | "latin"): { hits: Hit[]; note: string } | null {
  if (script === "bn") {
    for (const split of bengaliSplits(key)) {
      const found = matchAll(px, split.base, { onlyWords: true }).filter((h) => h.tier === 0);
      if (found.length) return { hits: found, note: describeSplit(shown, split) };
    }
    return null;
  }
  for (const stem of englishStems(key)) {
    // Exact only: a stem like "dog" must not match a letter whose gloss merely mentions it.
    const found = matchAll(px, stem, { onlyWords: true }).filter((h) => h.tier === 0);
    if (found.length) return { hits: found, note: `${shown} → ${stem}` };
  }
  return null;
}

/** The query's words for the per-word fallback: [as typed (punctuation trimmed), search form]. */
function queryWords(query: string): [string, string][] {
  const script = detectScript(query);
  const out: [string, string][] = [];
  for (const raw of query.split(/\s+/)) {
    for (const piece of (script === "bn" ? [raw] : raw.split(/[^\p{L}\p{N}'’]+/u))) {
      const shown = piece.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
      const key = script === "bn" ? normBn(shown) : normEn(shown);
      if (!key || (script !== "bn" && SKIP_WORDS.has(key))) continue;
      out.push([shown, key]);
    }
  }
  return out;
}

/** One word of the per-word fallback: exact, then a base form, then a close spelling. */
function lookupWord(px: Prepared, shown: string, key: string, script: "bn" | "latin"): WordHit {
  const top = matchAll(px, key, { onlyWords: true })[0];
  if (top && top.tier <= 1) return { word: shown, hit: top };
  const base = viaBase(px, shown, key, script);
  if (base) return { word: shown, hit: base.hits[0], note: base.note };
  const sg = suggest(px, key, { onlyWords: true, limit: 1 })[0];
  return sg ? { word: shown, suggestion: sg } : { word: shown };
}

/**
 * Course results for the box. Whole-phrase matches first; when a multi-word query has no exact or
 * whole-word match, each word is looked up on its own instead. With no match at all, a base form
 * (Bengali ending stripped, English plural or -ing/-ed undone) and then close spellings are tried.
 */
export function searchCourse(px: Prepared, query: string, limit = 8): CourseResult {
  const q = query.trim();
  const script = detectScript(q);
  if (script === "none") return { kind: "empty" };
  const hits = matchAll(px, q);
  const multi = normEn(q).split(" ").length > 1 || normBn(q).split(" ").length > 1;
  const full = hits.length > 0 && hits[0].tier <= 1;
  if (full) return { kind: "phrase", hits: hits.slice(0, limit), total: hits.length };
  const lang = script === "bn" ? "bn" : "latin";

  if (!multi) {
    const key = script === "bn" ? normBn(q) : normEn(q);
    const shown = q.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    const base = key ? viaBase(px, shown, key, lang) : null;
    if (base) {
      const rest = hits.filter((h) => !base.hits.some((b) => b.i === h.i));
      const all = [...base.hits, ...rest];
      return { kind: "phrase", hits: all.slice(0, limit), total: all.length, note: base.note };
    }
    if (hits.length === 0) {
      const suggestions = suggest(px, q);
      return { kind: "phrase", hits: [], total: 0, ...(suggestions.length ? { suggestions } : {}) };
    }
    return { kind: "phrase", hits: hits.slice(0, limit), total: hits.length };
  }

  // A whole phrase one typo away ("thnak you") beats looking at the words one by one.
  if (hits.length === 0) {
    const whole = suggest(px, q).filter((s) => s.whole);
    if (whole.length) return { kind: "phrase", hits: [], total: 0, suggestions: whole };
  }

  const out: WordHit[] = [];
  const seen = new Set<string>();
  for (const [shown, key] of queryWords(q)) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lookupWord(px, shown, key, lang));
  }
  if (!out.some((w) => w.hit)) {
    const suggestions = hits.length === 0 ? suggest(px, q) : [];
    return { kind: "phrase", hits: hits.slice(0, limit), total: hits.length, ...(suggestions.length ? { suggestions } : {}) };
  }
  return { kind: "words", words: out.slice(0, limit) };
}

/**
 * Course romanization for arbitrary Bengali text, word by word, or null when any word is not in
 * the course (so a guess is never shown).
 */
export function romanizeWithCourse(px: Prepared, bn: string): string | null {
  const words = normBn(bn).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const out: string[] = [];
  for (const w of words) {
    const t = px.words.get(w);
    if (!t) return null;
    out.push(t);
  }
  return out.join(" ");
}
