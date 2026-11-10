// Shared helpers for content tooling (validate, gen-lesson, status).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BENGALI = /[ঀ-৿]/;
export const POS = new Set([
  "noun", "pronoun", "verb", "adj", "adv", "postposition", "particle",
  "number", "classifier", "phrase", "name", "letter",
]);
export const REGISTERS = new Set(["intimate", "familiar", "polite", "formal-written"]);

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
export const rel = (f) => path.relative(ROOT, f);

/** Split a Bengali sentence into word tokens (punctuation stripped). */
export function tokenize(s) {
  return s
    .normalize("NFC")
    .replace(/[।॥?!,.;:"“”'‘’()—–]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
/** Split an English sentence into word-bank tiles. */
export function enTiles(s) {
  return stripParens(s).replace(/[.?!,;:"“”]/g, " ").split(/\s+/).filter(Boolean);
}
/** "How are you? (polite)" -> "How are you?" */
export function stripParens(s) {
  return s.replace(/\s*\([^)]*\)/g, "").trim();
}
/** Loose English key for "do these mean the same thing?" checks. */
export function enKey(s) {
  return stripParens(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function lessonPath(unit, lessonId) {
  return path.join(ROOT, unit.track === "script" ? "script" : "units", unit.id, `${lessonId}.json`);
}

/** Load course, lexicon and plans; never throws on content errors, reports them instead. */
export function loadAll() {
  const problems = []; // { level: "error"|"warn", where, msg }
  const P = (level, where, msg) => problems.push({ level, where, msg });

  const course = readJson(path.join(ROOT, "course.json"));
  const units = new Map(course.units.map((u) => [u.id, u]));

  // Lexicon
  const lexicon = new Map(); // id -> entry (+ _file, _unit)
  const lexDir = path.join(ROOT, "lexicon");
  for (const f of fs.existsSync(lexDir) ? fs.readdirSync(lexDir).filter((x) => x.endsWith(".json")).sort() : []) {
    const file = path.join(lexDir, f);
    let data;
    try { data = readJson(file); } catch (e) { P("error", rel(file), `invalid JSON: ${e.message}`); continue; }
    if (data.unit !== f.replace(/\.json$/, "")) P("error", rel(file), `unit "${data.unit}" doesn't match file name`);
    for (const e of data.entries ?? []) {
      if (lexicon.has(e.id)) { P("error", rel(file), `duplicate lexicon id "${e.id}" (also in ${lexicon.get(e.id)._file})`); continue; }
      lexicon.set(e.id, { ...e, _file: rel(file), _unit: data.unit });
    }
  }

  // Plans
  const plans = new Map(); // unitId -> plan
  const planDir = path.join(ROOT, "plans");
  for (const f of fs.existsSync(planDir) ? fs.readdirSync(planDir).filter((x) => x.endsWith(".json")).sort() : []) {
    const file = path.join(planDir, f);
    try {
      const data = readJson(file);
      plans.set(data.unit, { ...data, _file: rel(file) });
    } catch (e) { P("error", rel(file), `invalid JSON: ${e.message}`); }
  }

  // Course order: units in course.json order; lessons in plan order (falls back to course.json order).
  const order = []; // lesson ids
  const lessonInfo = new Map(); // lessonId -> { unit, planLesson, index }
  for (const u of course.units) {
    const plan = plans.get(u.id);
    const ids = plan ? plan.lessons.map((l) => l.id) : u.lessons;
    for (const id of u.lessons) if (!ids.includes(id)) ids.push(id);
    for (const id of ids) {
      if (lessonInfo.has(id)) { P("error", "course", `lesson id "${id}" used twice`); continue; }
      lessonInfo.set(id, { unit: u, planLesson: plan?.lessons.find((l) => l.id === id), index: order.length });
      order.push(id);
    }
  }
  for (const [uid, plan] of plans) if (!units.has(uid)) P("error", plan._file, `unit "${uid}" is not in course.json`);

  return { course, units, lexicon, plans, order, lessonInfo, problems };
}

/** All lexicon entries introduced at or before the given lesson (course order). */
export function knownAt(ctx, lessonId) {
  const idx = ctx.lessonInfo.get(lessonId)?.index ?? -1;
  return [...ctx.lexicon.values()].filter((e) => {
    const i = ctx.lessonInfo.get(e.lesson)?.index;
    return i !== undefined && i <= idx;
  });
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Shared lesson analysis (audit, validate --strict, recycle)
// ---------------------------------------------------------------------------

/** Core parts of speech: the words a learner needs in every conversation. */
export const CORE_POS = new Set(["pronoun", "verb", "particle", "postposition", "number", "adv"]);

/** Authored lessons in course order: { id, unit, data, idx } (idx = position in ctx.order). */
export function loadLessons(ctx) {
  const out = [];
  for (const u of ctx.course.units) {
    for (const id of u.lessons) {
      const f = lessonPath(u, id);
      if (fs.existsSync(f)) out.push({ id, unit: u, data: readJson(f), idx: ctx.lessonInfo.get(id)?.index ?? out.length });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

export const isRecycle = (ex) => ex?.recycle === true;

/** Bengali tokens a learner meets in an exercise (prompts, audio, options, tiles, pairs). */
export function exerciseTokens(ex) {
  const out = [];
  const add = (s) => typeof s === "string" && BENGALI.test(s) && out.push(...tokenize(s).filter((t) => BENGALI.test(t)));
  add(ex.prompt?.bn); add(ex.audio?.bn); add(ex.glyph);
  for (const o of ex.options ?? []) add(o);
  for (const t of ex.tiles ?? []) add(t);
  for (const p of ex.pairs ?? []) add(p.bn);
  return out;
}
/** Space-padded token string, for whole-token phrase search. */
export const exerciseText = (ex) => ` ${exerciseTokens(ex).join(" ")} `;
/** Does a space-padded text contain the Bengali form as whole tokens? */
export const hasForm = (text, bn) => text.includes(` ${tokenize(bn).join(" ")} `);

/**
 * What an exercise actually tests ("targets"): prompt, audio, glyph, match pairs, and the
 * correct answer of en_to_bn selects / word banks / typed answers. Distractors are excluded.
 */
export function exerciseTargetText(ex) {
  const parts = [];
  const add = (s) => typeof s === "string" && BENGALI.test(s) && parts.push(...tokenize(s).filter((t) => BENGALI.test(t)));
  add(ex.prompt?.bn); add(ex.audio?.bn); add(ex.glyph);
  for (const p of ex.pairs ?? []) add(p.bn);
  if (ex.type === "select_translation" && ex.direction === "en_to_bn") add(ex.options?.[ex.answer]);
  if (ex.type === "listen_select") add(ex.options?.[ex.answer]);
  if (ex.type === "word_bank" && ex.direction === "en_to_bn") add((ex.answer ?? []).join(" "));
  if (ex.type === "type_translation" && ex.direction === "en_to_bn") for (const a of ex.accepted ?? []) add(a);
  return ` ${parts.join(" ")} `;
}

/** Is this unit's lesson a review lesson? (plan kind "review" or title starts with "Review") */
export function isReviewLesson(ctx, lessonId, data) {
  const pl = ctx.lessonInfo.get(lessonId)?.planLesson;
  return pl?.kind === "review" || /^review/i.test(pl?.title ?? data?.title ?? "");
}

/** Lexicon words a unit teaches that a review should cover (no names or letters). */
export function unitReviewWords(ctx, unitId) {
  return [...ctx.lexicon.values()].filter((e) => e._unit === unitId && e.pos !== "name" && e.pos !== "letter");
}

/**
 * Review coverage per main-track unit: share of the unit's words tested as targets across its review
 * lesson(s). Recycle exercises are ignored. Returns [{unit, reviews:[ids], words, covered, pct, missing:[bn]}].
 */
export function reviewCoverage(ctx, lessons) {
  const out = [];
  for (const u of ctx.course.units) {
    if (u.track !== "main") continue;
    const reviews = lessons.filter((l) => l.unit.id === u.id && isReviewLesson(ctx, l.id, l.data));
    const words = unitReviewWords(ctx, u.id);
    const text = reviews.map((l) => l.data.exercises.filter((e) => !isRecycle(e)).map(exerciseTargetText).join("|")).join("|");
    const missing = words.filter((w) => !hasForm(text, w.bn));
    out.push({
      unit: u.id, reviews: reviews.map((l) => l.id), words: words.length, covered: words.length - missing.length,
      pct: words.length ? (100 * (words.length - missing.length)) / words.length : 100, missing: missing.map((w) => w.bn),
    });
  }
  return out;
}

/** Number of exercises (whole course, incl. recycle) in which each main-track word is a target. */
export function targetCounts(ctx, lessons) {
  const texts = lessons.flatMap((l) => l.data.exercises.map(exerciseTargetText));
  const out = [];
  for (const e of ctx.lexicon.values()) {
    if (e.pos === "letter" || e.pos === "name" || ctx.units.get(e._unit)?.track !== "main") continue;
    let n = 0;
    for (const t of texts) if (hasForm(t, e.bn)) n++;
    out.push({ id: e.id, bn: e.bn, en: e.en, pos: e.pos, lesson: e.lesson, n });
  }
  return out;
}

const DIGITS = "০১২৩৪৫৬৭৮৯";
/**
 * Bengali tokens shown in main-track exercises before the lexicon teaches them.
 * Multi-digit numerals built from already-taught digits are exempt. Recycle exercises are checked too.
 * Returns [{lesson, ex, token, taughtIn|null}].
 */
export function findUntaught(ctx, lessons) {
  const introAt = new Map(); // token -> earliest lesson index
  for (const e of ctx.lexicon.values()) {
    const i = ctx.lessonInfo.get(e.lesson)?.index;
    if (i === undefined) continue;
    for (const t of tokenize(e.bn)) if (!introAt.has(t) || introAt.get(t) > i) introAt.set(t, i);
  }
  const out = [];
  for (const l of lessons) {
    if (l.unit.track === "script") continue; // script lessons preview later words and build syllables
    for (const ex of l.data.exercises) {
      for (const t of exerciseTokens(ex)) {
        const at = introAt.get(t);
        if (at !== undefined && at <= l.idx) continue;
        if ([...t].length > 1 && [...t].every((c) => DIGITS.includes(c) && (introAt.get(c) ?? Infinity) <= l.idx)) continue;
        out.push({ lesson: l.id, ex: ex.id, token: t, taughtIn: at === undefined ? null : ctx.order[at] });
      }
    }
  }
  return out;
}

const RECOG = new Set(["select_translation:bn_to_en", "match_pairs:", "listen_select:", "script_recognize:"]);
/** New vocab whose first exercise (ignoring recycle exercises) is production. [{lesson, word, ex, type, track}] */
export function findProductionFirst(lessons) {
  const out = [];
  for (const l of lessons) {
    const exs = l.data.exercises.filter((e) => !isRecycle(e));
    for (const v of l.data.vocab ?? []) {
      const first = exs.find((ex) => hasForm(exerciseText(ex), v.bn));
      if (!first) continue;
      const key = `${first.type}:${first.direction ?? ""}`;
      const isTarget = first.prompt?.bn?.includes(v.bn) || first.audio?.bn?.includes(v.bn) || first.glyph === v.bn || (first.pairs ?? []).some((p) => p.bn === v.bn);
      if (!RECOG.has(key) && !(key === "select_translation:en_to_bn" && !isTarget))
        out.push({ lesson: l.id, word: v.id, ex: first.id, type: first.type, track: l.unit.track });
    }
  }
  return out;
}
