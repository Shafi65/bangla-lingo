// Server-only: the compact course index the Translate page searches on the device.
//
// Built at build time from content/lexicon (taught words), content/assumed (words intermediate units
// use without teaching) and the example sentences in content/plans. Only the fields the page shows or
// searches are kept, and empty ones are dropped, so the payload stays small.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse } from "../content";
import { getGuideUnits, getLexicon } from "../guide/data";
import type { TranslateData, TItem } from "./types";

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
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

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];
const bnKey = (s: string) => s.normalize("NFC").replace(/[\s।॥?!,.;:]+/g, " ").trim();

interface RawSentence {
  bn?: unknown;
  tr?: unknown;
  en?: unknown;
  alt?: unknown;
}

let cached: TranslateData | undefined;

export function getTranslateData(): TranslateData {
  if (cached) return cached;
  const base = path.resolve(getContentBaseDir());
  const unitIds = getCourse().units.map((u) => u.id);
  const units = getCourse().units.map((u) => ({ id: u.id, title: u.title }));

  // Lessons that have a section in the guide (the link target of "Taught in ...").
  const lessons: TranslateData["lessons"] = {};
  for (const g of getGuideUnits()) {
    const u = unitIds.indexOf(g.id);
    if (u < 0) continue;
    for (const l of g.lessons ?? []) lessons[l.id] = { t: l.title, u };
  }

  const items: TItem[] = [];
  const seen = new Set<string>();

  for (const e of getLexicon()) {
    const bn = str(e.bn);
    const tr = str(e.tr);
    const en = str(e.en);
    if (!bn || !tr || !en) continue;
    seen.add(bnKey(bn));
    const alt = strs(e.alt);
    const kb = str(e.kolkata?.bn);
    const kt = str(e.kolkata?.tr);
    const notes = str(e.notes);
    items.push({
      bn,
      tr,
      en,
      ...(alt.length ? { alt } : {}),
      ...(e.pos ? { pos: e.pos } : {}),
      ...(kb ? { kb } : {}),
      ...(kt ? { kt } : {}),
      ...(notes ? { n: notes } : {}),
      ...(e.lesson && lessons[e.lesson] ? { l: e.lesson } : {}),
    });
  }

  for (const f of jsonFiles(path.join(base, "assumed"))) {
    const d = readJson<{ entries?: Record<string, unknown>[] }>(f);
    for (const e of d?.entries ?? []) {
      const bn = str(e?.bn);
      const tr = str(e?.tr);
      const en = str(e?.en);
      if (!bn || !tr || !en || seen.has(bnKey(bn))) continue;
      seen.add(bnKey(bn));
      const alt = strs(e.alt);
      const pos = str(e.pos);
      const notes = str(e.notes);
      items.push({
        bn,
        tr,
        en,
        ...(alt.length ? { alt } : {}),
        ...(pos ? { pos } : {}),
        ...(notes ? { n: notes } : {}),
        a: 1,
      });
    }
  }

  for (const f of jsonFiles(path.join(base, "plans"))) {
    const d = readJson<{ lessons?: { id?: unknown; sentences?: RawSentence[] }[] }>(f);
    for (const pl of d?.lessons ?? []) {
      const lesson = str(pl?.id);
      for (const s of pl?.sentences ?? []) {
        const bn = str(s?.bn);
        const tr = str(s?.tr);
        const en = str(s?.en);
        if (!bn || !tr || !en) continue;
        const k = bnKey(bn);
        if (seen.has(k)) continue;
        seen.add(k);
        const alt = strs(s.alt);
        items.push({
          bn,
          tr,
          en,
          ...(alt.length ? { alt } : {}),
          s: 1,
          ...(lesson && lessons[lesson] ? { l: lesson } : {}),
        });
      }
    }
  }

  return (cached = { units, lessons, items });
}
