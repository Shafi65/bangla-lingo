#!/usr/bin/env node
// Validates content/ against docs/CONTENT_SCHEMA.md. Exit 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const BENGALI = /[ঀ-৿]/;
const TYPES = new Set([
  "select_translation", "word_bank", "match_pairs",
  "listen_select", "type_translation", "script_recognize",
]);
const DIRS = new Set(["bn_to_en", "en_to_bn"]);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { err(path.relative(ROOT, file), `invalid JSON (${e.message})`); return null; }
}
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

function checkLesson(file, expectedId, unitId) {
  const rel = path.relative(ROOT, file);
  const L = readJson(file);
  if (!L) return;
  if (L.id !== expectedId) err(rel, `id "${L.id}" != expected "${expectedId}"`);
  if (L.unit !== unitId) err(rel, `unit "${L.unit}" != "${unitId}"`);
  if (!isStr(L.title)) err(rel, "missing title");
  if (!Array.isArray(L.vocab)) err(rel, "vocab must be an array");
  L.vocab?.forEach((v, i) => {
    if (!isStr(v.id)) err(`${rel} vocab[${i}]`, "missing id");
    checkBnText(`${rel} vocab[${i}]`, v);
  });
  if (!Array.isArray(L.exercises) || L.exercises.length === 0) return err(rel, "no exercises");
  if (L.exercises.length < 8 || L.exercises.length > 15)
    warn(rel, `${L.exercises.length} exercises (target 8–15)`);
  const ids = new Set();
  L.exercises.forEach((ex, i) => {
    const where = `${rel} ex[${i}]${ex.id ? ` (${ex.id})` : ""}`;
    if (!isStr(ex.id)) err(where, "missing id");
    else if (ids.has(ex.id)) err(where, "duplicate exercise id");
    else ids.add(ex.id);
    checkExercise(where, ex);
  });
  // each vocab item should appear at least twice across the lesson
  const blob = JSON.stringify(L.exercises);
  for (const v of L.vocab ?? []) {
    if (!v.bn) continue;
    const n = blob.split(v.bn).length - 1;
    if (n < 2) warn(rel, `vocab "${v.bn}" appears ${n}× in exercises (target ≥2)`);
  }
  return L.exercises.length;
}

// ---- main
const coursePath = path.join(ROOT, "course.json");
if (!fs.existsSync(coursePath)) {
  console.error("content/course.json not found");
  process.exit(1);
}
const course = readJson(coursePath);
let lessonCount = 0, exCount = 0;
const seenUnits = new Set(), seenLessons = new Set();
for (const u of course?.units ?? []) {
  const where = `course.json unit ${u.id}`;
  if (!isStr(u.id) || seenUnits.has(u.id)) err(where, "missing/duplicate unit id");
  seenUnits.add(u.id);
  if (!["main", "script"].includes(u.track)) err(where, `bad track "${u.track}"`);
  if (!isStr(u.title)) err(where, "missing title");
  const dir = path.join(ROOT, u.track === "script" ? "script" : "units", u.id);
  for (const lid of u.lessons ?? []) {
    if (seenLessons.has(lid)) err(where, `duplicate lesson id ${lid}`);
    seenLessons.add(lid);
    const f = path.join(dir, `${lid}.json`);
    if (!fs.existsSync(f)) { err(where, `missing lesson file ${path.relative(ROOT, f)}`); continue; }
    const n = checkLesson(f, lid, u.id);
    if (n) { lessonCount++; exCount += n; }
  }
}

warnings.forEach((w) => console.warn(`⚠  ${w}`));
errors.forEach((e) => console.error(`✗  ${e}`));
console.log(`\n${seenUnits.size} units, ${lessonCount} lessons, ${exCount} exercises — ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
