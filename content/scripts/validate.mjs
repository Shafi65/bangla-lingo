#!/usr/bin/env node
// Validates content/ against docs/CONTENT_SCHEMA.md and docs/LESSON_PIPELINE.md.
// Usage: npm run validate [-- --quiet]   (exit 1 on any error)
import fs from "node:fs";
import { BENGALI, POS, REGISTERS, loadAll, knownAt, lessonPath, readJson, rel, tokenize } from "./lib.mjs";

const quiet = process.argv.includes("--quiet");
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const TYPES = new Set([
  "select_translation", "word_bank", "match_pairs",
  "listen_select", "type_translation", "script_recognize",
]);
const DIRS = new Set(["bn_to_en", "en_to_bn"]);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

function checkBnText(where, t, { requireEn = true } = {}) {
  if (!t || typeof t !== "object") return err(where, "missing BnText object");
  if (!isStr(t.bn)) err(where, "missing bn");
  else if (!BENGALI.test(t.bn)) err(where, `bn "${t.bn}" has no Bengali characters`);
  if (!isStr(t.tr)) err(where, "missing tr");
  else if (t.tr !== t.tr.toLowerCase()) warn(where, `tr "${t.tr}" should be lowercase`);
  if (requireEn && !isStr(t.en)) err(where, "missing en");
}

// ---------------------------------------------------------------- load
let ctx;
try { ctx = loadAll(); } catch (e) { console.error(`✗  could not load content: ${e.message}`); process.exit(1); }
for (const p of ctx.problems) (p.level === "error" ? err : warn)(p.where, p.msg);
const { course, lexicon, plans, lessonInfo } = ctx;

// ---------------------------------------------------------------- lexicon
const byBn = new Map();
for (const e of lexicon.values()) {
  const where = `${e._file} [${e.id}]`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) err(where, "id must be a lowercase slug");
  checkBnText(where, e);
  if (!POS.has(e.pos)) err(where, `pos "${e.pos}" invalid (one of ${[...POS].join(", ")})`);
  if (e.register && !REGISTERS.has(e.register)) err(where, `register "${e.register}" invalid`);
  if (e.alt && !isStrArr(e.alt)) err(where, "alt must be string[]");
  const info = lessonInfo.get(e.lesson);
  if (!info) { err(where, `lesson "${e.lesson}" not found in any plan/course`); continue; }
  if (info.unit.id !== e._unit) err(where, `lesson ${e.lesson} belongs to ${info.unit.id}, but entry is in ${e._unit} lexicon`);
  if (info.planLesson && !info.planLesson.new.includes(e.id)) err(where, `plan for ${e.lesson} doesn't list it in "new"`);
  const k = `${e.bn}|${e.en}`;
  if (byBn.has(k)) err(where, `same bn+en as "${byBn.get(k)}" — reuse that id instead`);
  byBn.set(k, e.id);
}

// ---------------------------------------------------------------- plans
let sentenceCount = 0;
for (const [uid, plan] of plans) {
  const unit = ctx.units.get(uid);
  if (!unit) continue;
  const ids = new Set();
  for (const L of plan.lessons ?? []) {
    const where = `${plan._file} ${L.id}`;
    if (ids.has(L.id)) err(where, "duplicate lesson id");
    ids.add(L.id);
    if (!L.id?.startsWith(uid.split("-")[0] + "-")) err(where, `lesson id should start with "${uid.split("-")[0]}-"`);
    if (!isStr(L.title)) err(where, "missing title");
    if (!Array.isArray(L.new) || !Array.isArray(L.review)) { err(where, "new/review must be arrays"); continue; }
    const myIdx = lessonInfo.get(L.id)?.index ?? Infinity;
    for (const id of L.new) {
      const e = lexicon.get(id);
      if (!e) err(where, `new "${id}" not in lexicon`);
      else if (e.lesson !== L.id) err(where, `new "${id}" is introduced in ${e.lesson} per lexicon`);
    }
    for (const id of L.review) {
      const e = lexicon.get(id);
      if (!e) err(where, `review "${id}" not in lexicon`);
      else if ((lessonInfo.get(e.lesson)?.index ?? Infinity) >= myIdx) err(where, `review "${id}" isn't introduced until ${e.lesson}`);
    }
    // sentences
    const sentences = L.sentences ?? [];
    sentenceCount += sentences.length;
    if (unit.track === "main" && (sentences.length < 6 || sentences.length > 10))
      warn(where, `${sentences.length} sentences (target 6–10)`);
    const known = new Set(knownAt(ctx, L.id).map((e) => e.bn.normalize("NFC")));
    // multi-word lexicon forms (phrases) count as known token sequences
    const phrases = [...known].filter((b) => b.includes(" "));
    const used = new Set();
    sentences.forEach((s, i) => {
      const sw = `${where} sentence[${i}] "${s.bn}"`;
      checkBnText(sw, s);
      if (s.alt && !isStrArr(s.alt)) err(sw, "alt must be string[]");
      if (isStr(s.bn) && !/[।?!]$/.test(s.bn.trim())) warn(sw, "should end with । or ?");
      let text = (s.bn ?? "").normalize("NFC");
      for (const ph of phrases) if (text.includes(ph)) { used.add(ph); text = text.split(ph).join(" "); }
      const unknown = tokenize(text).filter((t) => { if (known.has(t)) { used.add(t); return false; } return true; });
      if (unknown.length) err(sw, `word(s) not yet taught: ${unknown.join(", ")}`);
    });
    if (unit.track === "main") for (const id of L.new) {
      const e = lexicon.get(id);
      if (e && !["phrase", "letter", "name"].includes(e.pos) && !used.has(e.bn.normalize("NFC")))
        warn(where, `new word "${e.bn}" (${id}) isn't used in any sentence`);
    }
  }
}

// ---------------------------------------------------------------- lessons
function checkIndex(where, ex) {
  if (!isStrArr(ex.options)) return err(where, "options must be non-empty string[]");
  if (ex.options.length < 2) err(where, "need at least 2 options");
  if (new Set(ex.options).size !== ex.options.length) err(where, "duplicate options");
  if (!Number.isInteger(ex.answer) || ex.answer < 0 || ex.answer >= ex.options.length)
    err(where, `answer index ${ex.answer} out of range`);
}
function checkExercise(where, ex) {
  if (!TYPES.has(ex.type)) return err(where, `unknown type "${ex.type}"`);
  switch (ex.type) {
    case "select_translation":
      checkBnText(`${where}.prompt`, ex.prompt);
      if (!DIRS.has(ex.direction)) err(where, "bad direction");
      checkIndex(where, ex);
      if (ex.direction === "en_to_bn" && ex.options?.some((o) => !BENGALI.test(o)))
        err(where, "en_to_bn options must be Bengali script");
      break;
    case "word_bank": {
      checkBnText(`${where}.prompt`, ex.prompt);
      if (!DIRS.has(ex.direction)) err(where, "bad direction");
      if (!isStrArr(ex.tiles) || !isStrArr(ex.answer)) { err(where, "tiles/answer must be string[]"); break; }
      const pool = [...ex.tiles];
      for (const a of ex.answer) {
        const i = pool.indexOf(a);
        if (i < 0) err(where, `answer tile "${a}" not in tiles`); else pool.splice(i, 1);
      }
      if (pool.length === 0) warn(where, "no distractor tiles");
      break;
    }
    case "match_pairs":
      if (!Array.isArray(ex.pairs) || ex.pairs.length < 4 || ex.pairs.length > 5)
        err(where, "match_pairs needs 4–5 pairs");
      ex.pairs?.forEach((p, i) => checkBnText(`${where}.pairs[${i}]`, p));
      if (ex.pairs && new Set(ex.pairs.map((p) => p.en)).size !== ex.pairs.length)
        err(where, "duplicate en in pairs (ambiguous match)");
      if (ex.pairs && new Set(ex.pairs.map((p) => p.bn)).size !== ex.pairs.length)
        err(where, "duplicate bn in pairs (ambiguous match)");
      break;
    case "listen_select":
      checkBnText(`${where}.audio`, ex.audio);
      checkIndex(where, ex);
      if (ex.options && ex.audio?.bn && ex.options[ex.answer] !== ex.audio.bn)
        warn(where, "correct option differs from audio.bn");
      break;
    case "type_translation":
      checkBnText(`${where}.prompt`, ex.prompt);
      if (!DIRS.has(ex.direction)) err(where, "bad direction");
      if (!isStrArr(ex.accepted)) err(where, "accepted must be non-empty string[]");
      break;
    case "script_recognize":
      if (!isStr(ex.glyph) || !BENGALI.test(ex.glyph)) err(where, "glyph must be Bengali");
      checkIndex(where, ex);
      break;
  }
}

let lessonCount = 0, exCount = 0;
for (const u of course.units) {
  const where = `course.json unit ${u.id}`;
  if (!["main", "script"].includes(u.track)) err(where, `bad track "${u.track}"`);
  if (!isStr(u.title)) err(where, "missing title");
  if (!plans.has(u.id)) warn(where, "no plan file in content/plans/");
  for (const lid of u.lessons ?? []) {
    const f = lessonPath(u, lid);
    if (!fs.existsSync(f)) { err(where, `missing lesson file ${rel(f)}`); continue; }
    const r = rel(f);
    let L;
    try { L = readJson(f); } catch (e) { err(r, `invalid JSON (${e.message})`); continue; }
    lessonCount++;
    if (L.id !== lid) err(r, `id "${L.id}" != expected "${lid}"`);
    if (L.unit !== u.id) err(r, `unit "${L.unit}" != "${u.id}"`);
    if (!isStr(L.title)) err(r, "missing title");
    if (L.status && !["draft", "reviewed"].includes(L.status)) err(r, `status "${L.status}" invalid`);
    if (plans.has(u.id) && !lessonInfo.get(lid)?.planLesson) warn(r, "lesson is not in the unit plan");
    if (!Array.isArray(L.vocab)) err(r, "vocab must be an array");
    L.vocab?.forEach((v, i) => {
      const vw = `${r} vocab[${i}]`;
      if (!isStr(v.id)) err(vw, "missing id");
      checkBnText(vw, v);
      const e = lexicon.get(v.id);
      if (lexicon.size && !e) err(vw, `"${v.id}" not in lexicon`);
      else if (e && (e.bn !== v.bn || e.tr !== v.tr)) err(vw, `"${v.id}" differs from lexicon (${e.bn} / ${e.tr})`);
      else if (e && e.en !== v.en) warn(vw, `"${v.id}" English "${v.en}" differs from lexicon "${e.en}"`);
    });
    if (!Array.isArray(L.exercises) || L.exercises.length === 0) { err(r, "no exercises"); continue; }
    exCount += L.exercises.length;
    if (L.exercises.length < 8 || L.exercises.length > 15)
      warn(r, `${L.exercises.length} exercises (target 8–15)`);
    const ids = new Set();
    L.exercises.forEach((ex, i) => {
      const w = `${r} ex[${i}]${ex.id ? ` (${ex.id})` : ""}`;
      if (!isStr(ex.id)) err(w, "missing id");
      else if (ids.has(ex.id)) err(w, "duplicate exercise id");
      else ids.add(ex.id);
      checkExercise(w, ex);
    });
    const blob = JSON.stringify(L.exercises);
    for (const v of L.vocab ?? []) {
      if (!v.bn) continue;
      const n = blob.split(v.bn).length - 1;
      if (n < 2) warn(r, `vocab "${v.bn}" appears ${n}× in exercises (target ≥2)`);
    }
  }
}

// ---------------------------------------------------------------- report
if (!quiet) warnings.forEach((w) => console.warn(`⚠  ${w}`));
errors.forEach((e) => console.error(`✗  ${e}`));
const planned = [...plans.values()].reduce((n, p) => n + (p.lessons?.length ?? 0), 0);
console.log(
  `\n${course.units.length} units · ${planned} planned lessons · ${lessonCount} authored (${exCount} exercises) · ` +
  `${lexicon.size} lexicon entries · ${sentenceCount} plan sentences — ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
