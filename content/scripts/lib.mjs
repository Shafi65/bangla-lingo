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
