// Server-only: Bengali -> transliteration lookup built from content.
//
// Sources (earlier wins): content/lexicon/*.json entries, lesson vocab,
// content/plans/*.json sentences, then prompts/pairs/audio inside lessons.
// Each (bn, tr) pair is indexed as a whole string and, when the word counts
// line up, token by token. `translitFor` then returns only the entries a given
// set of exercises actually needs, so pages ship a small map.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getAllLessons, getContentBaseDir } from "./content";
import type { Exercise } from "./types";

export type TranslitMap = Record<string, string>;

const EDGE = /^[\s।॥?!,.;:"“”‘’()\-–—…]+|[\s।॥?!,.;:"“”‘’()\-–—…]+$/g;

/** Canonical lookup key: NFC, edge punctuation stripped, whitespace collapsed. */
function canon(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").replace(EDGE, "");
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function jsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

interface Index {
  whole: Map<string, string>;
  token: Map<string, string>;
}

let cached: Index | undefined;

function build(): Index {
  const whole = new Map<string, string>();
  const token = new Map<string, string>();

  const add = (bn: unknown, tr: unknown) => {
    if (typeof bn !== "string" || typeof tr !== "string") return;
    const b = canon(bn);
    const t = tr.normalize("NFC").replace(/\s+/g, " ").replace(EDGE, "");
    if (!b || !t) return;
    if (!whole.has(b)) whole.set(b, t);
    const bt = b.split(" ");
    const tt = t.split(" ");
    if (bt.length > 1 && bt.length === tt.length) {
      bt.forEach((w, i) => {
        const k = canon(w);
        const v = tt[i].replace(EDGE, "");
        if (k && v && !token.has(k)) token.set(k, v);
      });
    }
  };

  const base = path.resolve(getContentBaseDir());
  for (const f of jsonFiles(path.join(base, "lexicon"))) {
    const d = readJson(f) as { entries?: { bn?: unknown; tr?: unknown }[] } | undefined;
    for (const e of d?.entries ?? []) add(e?.bn, e?.tr);
  }
  const lessons = getAllLessons();
  for (const l of lessons) for (const v of l.vocab ?? []) add(v.bn, v.tr);
  for (const f of jsonFiles(path.join(base, "plans"))) {
    const d = readJson(f) as { lessons?: { sentences?: { bn?: unknown; tr?: unknown }[] }[] } | undefined;
    for (const pl of d?.lessons ?? []) for (const s of pl?.sentences ?? []) add(s?.bn, s?.tr);
  }
  for (const l of lessons) {
    for (const ex of l.exercises) {
      if ("prompt" in ex) add(ex.prompt.bn, ex.prompt.tr);
      if (ex.type === "listen_select") add(ex.audio.bn, ex.audio.tr);
      if (ex.type === "match_pairs") for (const p of ex.pairs) add(p.bn, p.tr);
    }
  }
  // Single-word entries double as token entries.
  for (const [b, t] of whole) if (!b.includes(" ") && !token.has(b)) token.set(b, t);
  return { whole, token };
}

function index(): Index {
  return (cached ??= build());
}

function resolve(s: string, idx: Index): string | undefined {
  const key = canon(s);
  if (!key) return undefined;
  const hit = idx.whole.get(key);
  if (hit) return hit;
  const parts = key.split(" ").map((w) => idx.token.get(w) ?? idx.whole.get(w));
  return parts.every(Boolean) ? parts.join(" ") : undefined;
}

/** Bengali strings that are shown as options/tiles and so need transliteration. */
function bengaliOptions(ex: Exercise): string[] {
  switch (ex.type) {
    case "select_translation":
      return ex.direction === "en_to_bn" ? ex.options : [];
    case "word_bank":
      return ex.direction === "en_to_bn" ? ex.tiles : [];
    case "listen_select":
      return ex.options;
    default:
      return [];
  }
}

/** Entries needed by these exercises, keyed by the exact NFC text shown. */
export function translitFor(exercises: readonly Exercise[]): TranslitMap {
  const idx = index();
  const out: TranslitMap = {};
  for (const ex of exercises) {
    for (const s of bengaliOptions(ex)) {
      const key = s.normalize("NFC");
      if (key in out) continue;
      const tr = resolve(s, idx);
      if (tr) out[key] = tr;
    }
  }
  return out;
}
