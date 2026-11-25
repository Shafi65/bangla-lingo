// Server-only: public word pages (/bengali/<slug>), one per lexicon word or phrase, built at build time
// from content/lexicon and the plan sentences. Letters are left out (the script track covers them).
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { normalizeAnswer } from "../answers";
import { explainConjuncts, type ConjunctPart } from "../conjuncts";
import { getContentBaseDir, getCourse } from "../content";
import { getGuideUnits, getLexicon, type GuideSentence, type LexiconEntry } from "../guide/data";

export interface WordLink {
  slug: string;
  bn: string;
  tr: string;
  en: string;
}

export interface WordPage extends WordLink {
  id: string;
  alt: string[];
  pos: string;
  notes?: string;
  kolkata?: { bn?: string; tr?: string };
  /** Unit and lesson that teach it; null for words no lesson teaches (the My family extras). */
  unit: { id: string; title: string } | null;
  lesson: { id: string; title: string } | null;
  examples: GuideSentence[];
  related: WordLink[];
  conjuncts: (ConjunctPart & { names: string[] })[];
}

/** Lowercase ASCII slug: "Hello (peace be upon you)" -> "hello-peace-be-upon-you". */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The main English meaning, without notes in brackets: "hello (in reply)" -> "hello". */
export function primaryEnglish(en: string): string {
  const main = en.replace(/\s*\([^)]*\)/g, "").split(/[;/]/)[0].trim();
  return main || en.trim();
}

/**
 * Slug from the English meaning and the romanization, so it reads well for either search
 * ("thank-you-dhonnobad"). Ties get -2, -3 in lexicon order. Slugs change if an entry's en or tr
 * changes; the lexicon is stable enough that this is acceptable for now.
 */
export function wordSlugs(entries: readonly { id: string; en: string; tr: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const e of entries) {
    const base = [slugify(primaryEnglish(e.en)), slugify(e.tr)].filter(Boolean).join("-").slice(0, 70).replace(/-+$/, "") || slugify(e.id);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    out.set(e.id, slug);
  }
  return out;
}

interface PlanSentence extends GuideSentence {
  lesson: string;
  /** Position in course order, for "taught here or later" ordering. */
  order: number;
  tokens: string[];
}

function planSentences(): PlanSentence[] {
  const out: PlanSentence[] = [];
  let order = 0;
  for (const u of getCourse().units) {
    let plan: { lessons?: { id: string; sentences?: GuideSentence[] }[] } | undefined;
    try {
      plan = JSON.parse(fs.readFileSync(path.join(getContentBaseDir(), "plans", `${u.id}.json`), "utf8"));
    } catch {
      continue;
    }
    for (const l of plan?.lessons ?? []) {
      for (const s of l.sentences ?? []) {
        if (typeof s?.bn !== "string" || typeof s.en !== "string") continue;
        out.push({ bn: s.bn, tr: s.tr ?? "", en: s.en, lesson: l.id, order: order++, tokens: normalizeAnswer(s.bn).split(" ") });
      }
    }
  }
  return out;
}

function containsRun(tokens: readonly string[], run: readonly string[]): boolean {
  if (!run.length || run.length > tokens.length) return false;
  for (let i = 0; i + run.length <= tokens.length; i++) {
    if (run.every((t, j) => tokens[i + j] === t)) return true;
  }
  return false;
}

/**
 * Up to 3 example sentences that use the word exactly (as whole words). Sentences from the lesson that
 * teaches it or later lessons come first, so the learner knows the other words; shorter ones win ties.
 */
export function pickExamples(bn: string, lessonOrder: number, sentences: readonly PlanSentence[]): GuideSentence[] {
  const run = normalizeAnswer(bn).split(" ");
  const seen = new Set<string>();
  return sentences
    .filter((s) => containsRun(s.tokens, run) && s.tokens.length > run.length)
    .sort((a, b) => Number(a.order < lessonOrder) - Number(b.order < lessonOrder) || a.tokens.length - b.tokens.length || a.order - b.order)
    .filter((s) => !seen.has(s.bn) && seen.add(s.bn))
    .slice(0, 3)
    .map(({ bn: b, tr, en }) => ({ bn: b, tr, en }));
}

let cache: { pages: WordPage[]; bySlug: Map<string, WordPage> } | undefined;

function build() {
  const lexicon = getLexicon();
  const letterNames = new Map(lexicon.filter((e) => e.pos === "letter").map((e) => [e.bn, e.tr]));
  const words = lexicon.filter((e) => e.pos !== "letter");
  const slugs = wordSlugs(words);
  const courseUnits = new Map(getCourse().units.map((u) => [u.id, u]));
  const lessonTitles = new Map<string, string>();
  for (const u of getGuideUnits()) for (const l of u.lessons ?? []) lessonTitles.set(l.id, l.title);
  const sentences = planSentences();
  const firstOrder = new Map<string, number>();
  for (const s of sentences) if (!firstOrder.has(s.lesson)) firstOrder.set(s.lesson, s.order);

  const link = (e: LexiconEntry): WordLink => ({ slug: slugs.get(e.id)!, bn: e.bn, tr: e.tr, en: e.en });
  const byLesson = new Map<string, LexiconEntry[]>();
  for (const e of words) if (e.lesson) byLesson.set(e.lesson, [...(byLesson.get(e.lesson) ?? []), e]);

  const pages = words.map((e): WordPage => {
    const unit = courseUnits.get(e.unit);
    const taught = unit && e.lesson ? e.lesson : undefined;
    return {
      ...link(e),
      id: e.id,
      alt: e.alt ?? [],
      pos: e.pos,
      ...(e.notes ? { notes: e.notes } : {}),
      ...(e.kolkata && (e.kolkata.bn || e.kolkata.tr) ? { kolkata: e.kolkata } : {}),
      unit: unit ? { id: unit.id, title: unit.title } : null,
      lesson: taught ? { id: taught, title: lessonTitles.get(taught) ?? taught } : null,
      examples: pickExamples(e.bn, firstOrder.get(e.lesson) ?? 0, sentences),
      related: (taught ? byLesson.get(taught) ?? [] : []).filter((r) => r.id !== e.id).slice(0, 8).map(link),
      conjuncts: explainConjuncts(e.bn).map((c) => ({ ...c, names: c.letters.map((l) => letterNames.get(l) ?? "") })),
    };
  });
  return { pages, bySlug: new Map(pages.map((p) => [p.slug, p])) };
}

/** Every word page, in lexicon (course) order. */
export function getWordPages(): WordPage[] {
  return (cache ??= build()).pages;
}

/**
 * Params for the /bengali/[slug] routes. Cache Components needs at least one, so a course with no
 * lexicon (the demo fixture) gets a placeholder that renders the not-found page.
 */
export function wordPageParams(): { slug: string }[] {
  const pages = getWordPages();
  return pages.length ? pages.map((p) => ({ slug: p.slug })) : [{ slug: "none" }];
}

export function getWordPage(slug: string): WordPage | undefined {
  return (cache ??= build()).bySlug.get(slug);
}
