// Server-only: the clipped sentences and phrases for Speaking practice, built from content/ at build time.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getContentBaseDir, getCourse } from "../content";
import { getLexicon } from "../guide/data";
import type { SpeakData, SpeakItem } from "./items";

const audioKey = (s: string) => s.normalize("NFC").trim();

function clipFiles(): Record<string, string> {
  try {
    const m = JSON.parse(process.env.BL_AUDIO_MANIFEST || "{}") as { items?: Record<string, string> };
    return m.items ?? {};
  } catch {
    return {};
  }
}

interface PlanSentence {
  bn?: string;
  tr?: string;
  en?: string;
}

function planSentences(unitId: string): Map<string, PlanSentence[]> {
  const out = new Map<string, PlanSentence[]>();
  try {
    const d = JSON.parse(fs.readFileSync(path.join(getContentBaseDir(), "plans", `${unitId}.json`), "utf8")) as {
      lessons?: { id?: string; sentences?: PlanSentence[] }[];
    };
    for (const l of d.lessons ?? []) if (l?.id && Array.isArray(l.sentences)) out.set(l.id, l.sentences);
  } catch {
    // no plan for this unit
  }
  return out;
}

let cached: SpeakData | undefined;

/**
 * Per main-track unit: the plan sentences and lexicon phrases of its playable lessons that have a
 * recorded clip. Every Bengali string comes from the plans/lexicon (never invented here).
 */
export function getSpeakData(): SpeakData {
  if (cached) return cached;
  const files = clipFiles();
  const lexicon = getLexicon();
  const lessons: string[] = [];
  const units: SpeakData["units"] = [];
  const items: SpeakItem[] = [];
  const seen = new Set<string>();

  for (const u of getCourse().units) {
    if (u.track !== "main") continue;
    const idx = u.lessons.map((l) => {
      lessons.push(l.id);
      return lessons.length - 1;
    });
    units.push({ id: u.id, title: u.title, lessons: idx });
    const plans = planSentences(u.id);
    u.lessons.forEach((ls, k) => {
      const add = (bn?: string, tr?: string, en?: string) => {
        if (!bn || !tr || !en) return;
        const clip = files[audioKey(bn)];
        const key = audioKey(bn);
        if (!clip || seen.has(key)) return;
        seen.add(key);
        items.push({ bn, tr, en, clip, l: idx[k] });
      };
      for (const s of plans.get(ls.id) ?? []) add(s.bn, s.tr, s.en);
      for (const e of lexicon) if (e.pos === "phrase" && e.lesson === ls.id) add(e.bn, e.tr, e.en);
    });
  }
  return (cached = { units, lessons, items });
}
