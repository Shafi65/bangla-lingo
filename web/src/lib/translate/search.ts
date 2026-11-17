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

export interface WordHit {
  word: string;
  hit?: Hit;
}

export type CourseResult =
  | { kind: "empty" }
  | { kind: "phrase"; hits: Hit[]; total: number }
  | { kind: "words"; words: WordHit[] };

/** The query's words for the per-word fallback: [as typed (punctuation trimmed), search form]. */
function queryWords(query: string): [string, string][] {
  const script = detectScript(query);
  const out: [string, string][] = [];
  for (const raw of query.split(/\s+/)) {
    for (const piece of (script === "bn" ? [raw] : raw.split(/[^\p{L}\p{N}'’]+/u))) {
      const shown = piece.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const key = script === "bn" ? normBn(shown) : normEn(shown);
      if (!key || (script !== "bn" && SKIP_WORDS.has(key))) continue;
      out.push([shown, key]);
    }
  }
  return out;
}

/**
 * Course results for the box. Whole-phrase matches first; when a multi-word query has no exact or
 * whole-word match, each word is looked up on its own instead.
 */
export function searchCourse(px: Prepared, query: string, limit = 8): CourseResult {
  const q = query.trim();
  if (detectScript(q) === "none") return { kind: "empty" };
  const hits = matchAll(px, q);
  const multi = normEn(q).split(" ").length > 1 || normBn(q).split(" ").length > 1;
  const full = hits.length > 0 && hits[0].tier <= 1;
  if (!multi || full) return { kind: "phrase", hits: hits.slice(0, limit), total: hits.length };

  const words: WordHit[] = [];
  const seen = new Set<string>();
  for (const [shown, key] of queryWords(q)) {
    if (seen.has(key)) continue;
    seen.add(key);
    const top = matchAll(px, key, { onlyWords: true })[0];
    words.push({ word: shown, hit: top && top.tier <= 1 ? top : undefined });
  }
  if (!words.some((w) => w.hit)) return { kind: "phrase", hits: hits.slice(0, limit), total: hits.length };
  return { kind: "words", words: words.slice(0, limit) };
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
