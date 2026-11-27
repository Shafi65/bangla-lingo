#!/usr/bin/env node
// Validates content/ against docs/CONTENT_SCHEMA.md and docs/LESSON_PIPELINE.md.
// Usage: npm run validate [-- --quiet] [-- --strict]   (exit 1 on any error)
//   --strict  also turns the teaching-quality rules into errors (npm run validate:strict):
//             untaught Bengali in main-track exercises, production-first new words, >10 new items in a lesson,
//             unit reviews covering <80% of the unit's words, reviews that introduce new words.
//             Reading-track units ("strand": "reading") may only use words from Sections 1-2, their assumed lists and earlier
//             reading units, never the I-track; this rule is always on (plain validate), not only with --strict.
//             Intermediate units (course.json "level": "intermediate") also get: <=12 new items per lesson, a reading and a
//             listen_meaning in every non-review lesson, and per-unit skill shares (en->bn >=55%, typed >=15%, sentence listening >=20%).
import fs from "node:fs";
import {
  BENGALI, EXERCISE_RANGE, LEVELS, LEVEL_TARGETS, MAX_NEW, POS, REGISTERS, assumedFor, blankOccurrences, findProductionFirst, findUntaught,
  isReadingUnit, isRecycle, isReviewLesson, knownAt, mayUseWordsFrom, lessonPath, lessonsByUnit, loadAll, loadLessons, readJson, rel, reviewCoverage, skillStats, tokenize,
  unitLevel,
} from "./lib.mjs";

const quiet = process.argv.includes("--quiet");
const strict = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const strictCounts = {};
const serr = (rule, where, msg) => { strictCounts[rule] = (strictCounts[rule] ?? 0) + 1; err(where, `[strict:${rule}] ${msg}`); };

const TYPES = new Set([
  "select_translation", "word_bank", "match_pairs",
  "listen_select", "type_translation", "script_recognize",
  "fill_blank", "listen_meaning", "reading",
]);
const MAX_RECYCLE = 6; // recycle-tagged exercises per lesson (default run adds 3; extra match_pairs may add more)
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
  // Supplementary lexicons (e.g. family-extra.json, used by /family): their unit is not in course.json and their
  // entries are not taught by any lesson, so they have no `lesson` (see CONTENT_SCHEMA.md, "My family").
  if (!ctx.units.has(e._unit)) {
    if (e.lesson !== undefined) err(where, `supplementary lexicon (unit "${e._unit}" is not in course.json): entries have no "lesson"`);
    const k = `${e.bn}|${e.en}`;
    if (byBn.has(k)) err(where, `same bn+en as "${byBn.get(k)}" — reuse that id instead`);
    byBn.set(k, e.id);
    continue;
  }
  const info = lessonInfo.get(e.lesson);
  if (!info) { err(where, `lesson "${e.lesson}" not found in any plan/course`); continue; }
  if (info.unit.id !== e._unit) err(where, `lesson ${e.lesson} belongs to ${info.unit.id}, but entry is in ${e._unit} lexicon`);
  if (info.planLesson && !info.planLesson.new.includes(e.id)) err(where, `plan for ${e.lesson} doesn't list it in "new"`);
  const k = `${e.bn}|${e.en}`;
  if (byBn.has(k)) err(where, `same bn+en as "${byBn.get(k)}" — reuse that id instead`);
  byBn.set(k, e.id);
}

// ---------------------------------------------------------------- assumed-known lists
const asmSeen = new Map(); // id -> entry
for (const set of ctx.assumed.values()) {
  for (const e of set.entries) {
    const where = `${set._file} [${e.id}]`;
    if (!isStr(e.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) err(where, "id must be a lowercase slug");
    checkBnText(where, e);
    if (!POS.has(e.pos)) err(where, `pos "${e.pos}" invalid (one of ${[...POS].join(", ")})`);
    if (e.alt !== undefined && !isStrArr(e.alt)) err(where, "alt must be string[]");
    if (e.notes !== undefined && !isStr(e.notes)) err(where, "notes must be a non-empty string");
    if (lexicon.has(e.id)) err(where, `id collides with lexicon id "${e.id}" (${lexicon.get(e.id)._file}); assumed ids must be unique`);
    const prev = asmSeen.get(e.id);
    if (prev && (prev.bn !== e.bn || prev.tr !== e.tr)) err(where, `id also in ${prev._file} with different spelling`);
    else if (prev) err(where, `duplicate assumed id (also in ${prev._file}) — list each entry once`);
    asmSeen.set(e.id, e);
  }
}

// ---------------------------------------------------------------- course: levels, sections, assumes
if (course.sections !== undefined) {
  if (!Array.isArray(course.sections) || course.sections.length === 0) err("course.json", "sections must be a non-empty array");
  else {
    const sid = new Set();
    course.sections.forEach((sec, i) => {
      const w = `course.json sections[${i}]`;
      if (!Number.isInteger(sec?.id) || sec.id < 1) err(w, "id must be a positive integer");
      else if (sid.has(sec.id)) err(w, `duplicate section id ${sec.id}`);
      else sid.add(sec.id);
      if (!isStr(sec?.title)) err(w, "missing title");
    });
  }
}
if (course.scriptOnly !== undefined) err("course.json", "scriptOnly is set per unit or lesson, not on the course");

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
    if (L.scriptOnly !== undefined && typeof L.scriptOnly !== "boolean") err(where, "scriptOnly must be true or false");
    if (!Array.isArray(L.new) || !Array.isArray(L.review)) { err(where, "new/review must be arrays"); continue; }
    const myIdx = lessonInfo.get(L.id)?.index ?? Infinity;
    for (const id of L.new) {
      const e = lexicon.get(id);
      if (!e) err(where, `new "${id}" not in lexicon`);
      else if (e.lesson !== L.id) err(where, `new "${id}" is introduced in ${e.lesson} per lexicon`);
    }
    const asmIds = new Set(assumedFor(ctx, unit).map((a) => a.id));
    for (const id of L.review) {
      const e = lexicon.get(id);
      if (!e) { if (!asmIds.has(id)) err(where, `review "${id}" not in lexicon${unit.assumes?.length ? " or the unit's assumed lists" : ""}`); }
      else if ((lessonInfo.get(e.lesson)?.index ?? Infinity) >= myIdx) err(where, `review "${id}" isn't introduced until ${e.lesson}`);
      else if (!mayUseWordsFrom(ctx, unit, ctx.units.get(e._unit))) err(where, `[reading-vocab] review "${id}" is taught in ${e.lesson}, outside the reading track's vocabulary (Sections 1–2, assumed lists, earlier reading units)`);
    }
    // preview: reading examples from any unit (script track), must exist in lexicon
    for (const id of L.preview ?? []) if (!lexicon.has(id)) err(where, `preview "${id}" not in lexicon`);
    // sentences
    const sentences = L.sentences ?? [];
    sentenceCount += sentences.length;
    const lettersOnly = L.new.length > 0 && L.new.every((id) => lexicon.get(id)?.pos === "letter");
    if (unit.track === "main" && !lettersOnly && (sentences.length < 6 || sentences.length > 10))
      warn(where, `${sentences.length} sentences (target 6–10)`);
    const known = new Set(knownAt(ctx, L.id).map((e) => e.bn.normalize("NFC")));
    // multi-word lexicon forms (phrases) match as whole-token sequences, longest first
    const phrases = [...known].filter((b) => b.includes(" ")).map((b) => tokenize(b)).sort((a, b) => b.length - a.length);
    const used = new Set();
    /** Unknown Bengali tokens in a text; marks the known forms it uses. */
    const unknownIn = (bn) => {
      const toks = tokenize(bn ?? "");
      const unknown = [];
      for (let t = 0; t < toks.length; ) {
        const ph = phrases.find((p) => p.every((w, k) => toks[t + k] === w));
        if (ph) { used.add(ph.join(" ")); t += ph.length; continue; }
        if (known.has(toks[t])) used.add(toks[t]); else unknown.push(toks[t]);
        t++;
      }
      return unknown;
    };
    sentences.forEach((s, i) => {
      const sw = `${where} sentence[${i}] "${s.bn}"`;
      checkBnText(sw, s);
      if (s.alt && !isStrArr(s.alt)) err(sw, "alt must be string[]");
      if (isStr(s.bn) && !/[।?!]$/.test(s.bn.trim())) warn(sw, "should end with । or ?");
      const unknown = unknownIn(s.bn);
      if (unknown.length) err(sw, `word(s) not yet taught: ${unknown.join(", ")}`);
    });
    // dialogue (intermediate recipe): a short dialogue/text with comprehension questions
    if (L.dialogue !== undefined) {
      const dw = `${where} dialogue`;
      const D = L.dialogue;
      if (!D || typeof D !== "object" || Array.isArray(D)) err(dw, "dialogue must be an object { title?, lines, questions }");
      else {
        if (D.title !== undefined && !isStr(D.title)) err(dw, "title must be a non-empty string");
        if (!Array.isArray(D.lines) || D.lines.length < 2 || D.lines.length > 8) err(dw, "needs 2–8 lines");
        else {
          D.lines.forEach((l, i) => {
            const lw = `${dw}.lines[${i}]`;
            checkBnText(lw, l);
            if (l?.speaker !== undefined && !isStr(l.speaker)) err(lw, "speaker must be a non-empty string");
            const unknown = unknownIn(l?.bn);
            if (unknown.length) err(lw, `word(s) not yet taught: ${unknown.join(", ")}`);
          });
          const withSpeaker = D.lines.filter((l) => l?.speaker !== undefined).length;
          if (withSpeaker !== 0 && withSpeaker !== D.lines.length) err(dw, "give every line a speaker, or none");
        }
        if (!Array.isArray(D.questions) || D.questions.length === 0) err(dw, "needs at least one question");
        else D.questions.forEach((q, i) => {
          const qw = `${dw}.questions[${i}]`;
          if (!isStr(q?.question)) err(qw, "question must be a non-empty string (English)");
          else if (BENGALI.test(q.question)) err(qw, "question is English; put Bengali in questionBn");
          if (q?.questionBn !== undefined) {
            checkBnText(`${qw}.questionBn`, q.questionBn);
            const unknown = unknownIn(q.questionBn?.bn);
            if (unknown.length) err(qw, `questionBn word(s) not yet taught: ${unknown.join(", ")}`);
          }
          checkIndex(qw, q ?? {});
          if (Array.isArray(q?.options) && q.options.some((o) => BENGALI.test(o)) && !q.options.every((o) => BENGALI.test(o)))
            err(qw, "options must be all English or all Bengali script");
          if (Array.isArray(q?.options) && q.options.every((o) => BENGALI.test(o))) for (const o of q.options) {
            const unknown = unknownIn(o);
            if (unknown.length) err(qw, `option "${o}" has word(s) not yet taught: ${unknown.join(", ")}`);
          }
        });
      }
    } else if (unitLevel(unit) === "intermediate" && unit.track === "main" && L.kind !== "review" && L.kind !== "checkpoint" && !/^review/i.test(L.title ?? ""))
      warn(where, "no dialogue (the intermediate recipe builds the reading exercise from it)");
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
      if (ex.alt !== undefined) {
        if (!Array.isArray(ex.alt) || !ex.alt.every(isStrArr)) err(where, "alt must be string[][]");
        else for (const seq of ex.alt) {
          const p2 = [...ex.tiles];
          for (const a of seq) { const i = p2.indexOf(a); if (i < 0) { err(where, `alt tile "${a}" not in tiles`); break; } p2.splice(i, 1); }
        }
      }
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
    case "fill_blank": {
      checkBnText(`${where}.sentence`, ex.sentence);
      if (!isStr(ex.blank)) { err(where, "blank must be a non-empty string"); break; }
      if (!BENGALI.test(ex.blank)) err(where, `blank "${ex.blank}" has no Bengali characters`);
      else if (isStr(ex.sentence?.bn)) {
        const n = blankOccurrences(ex.sentence.bn, ex.blank).length;
        if (n !== 1) err(where, `blank "${ex.blank}" must occur exactly once in sentence.bn as whole word(s) (found ${n})`);
      }
      const choice = ex.options !== undefined || ex.answer !== undefined;
      const typed = ex.accepted !== undefined;
      if (choice && typed) err(where, "give either options + answer or accepted, not both");
      else if (!choice && !typed) err(where, "needs options + answer (choose) or accepted (type)");
      else if (choice) {
        checkIndex(where, ex);
        if (ex.options?.some((o) => !BENGALI.test(o))) err(where, "options must be Bengali script");
        else if (Array.isArray(ex.options) && ex.options[ex.answer] !== undefined &&
          ex.options[ex.answer].normalize("NFC").trim() !== ex.blank.normalize("NFC").trim())
          err(where, `correct option "${ex.options[ex.answer]}" must equal blank "${ex.blank}"`);
      } else if (!isStrArr(ex.accepted)) err(where, "accepted must be non-empty string[]");
      break;
    }
    case "listen_meaning":
      checkBnText(`${where}.audio`, ex.audio);
      checkIndex(where, ex);
      if (ex.options?.some((o) => BENGALI.test(o))) err(where, "options must be English meanings");
      break;
    case "reading": {
      if (ex.title !== undefined && !isStr(ex.title)) err(where, "title must be a non-empty string");
      if (!Array.isArray(ex.lines) || ex.lines.length < 2 || ex.lines.length > 8) err(where, "reading needs 2–8 lines");
      else {
        ex.lines.forEach((l, i) => {
          checkBnText(`${where}.lines[${i}]`, l);
          if (l?.speaker !== undefined && !isStr(l.speaker)) err(`${where}.lines[${i}]`, "speaker must be a non-empty string");
        });
        const withSpeaker = ex.lines.filter((l) => l?.speaker !== undefined).length;
        if (withSpeaker !== 0 && withSpeaker !== ex.lines.length) err(where, "give every line a speaker, or none");
      }
      if (!isStr(ex.question)) err(where, "question must be a non-empty string (English)");
      else if (BENGALI.test(ex.question)) err(where, "question is English; put Bengali in questionBn");
      if (ex.questionBn !== undefined) checkBnText(`${where}.questionBn`, ex.questionBn);
      checkIndex(where, ex);
      if (Array.isArray(ex.options) && ex.options.some((o) => BENGALI.test(o)) && !ex.options.every((o) => BENGALI.test(o)))
        err(where, "options must be all English or all Bengali script");
      break;
    }
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
  if (u.strand !== undefined && u.strand !== "reading") err(where, `bad strand "${u.strand}" (only "reading")`);
  if (u.strand === "reading") {
    if (u.track !== "main") err(where, `a reading-track unit must have "track": "main"`);
    for (const n of u.assumes ?? []) if (!["bridge", "heritage-oral"].includes(n)) err(where, `a reading-track unit may only assume "bridge" and "heritage-oral", not "${n}"`);
    if (u.level !== "intermediate") err(where, `a reading-track unit must have "level": "intermediate"`);
  }
  if (/^r\d+-/.test(u.id ?? "") !== (u.strand === "reading")) err(where, `reading-track units (and only those) have "strand": "reading" and an id like r01-…`);
  if (!isStr(u.title)) err(where, "missing title");
  if (u.level !== undefined && !LEVELS.includes(u.level)) err(where, `bad level "${u.level}" (one of ${LEVELS.join(", ")})`);
  if (u.section !== undefined) {
    if (!Number.isInteger(u.section) || u.section < 1) err(where, "section must be a positive integer");
    else if (Array.isArray(course.sections) && !course.sections.some((x) => x?.id === u.section)) err(where, `section ${u.section} is not listed in course.json "sections"`);
  }
  if (u.scriptOnly !== undefined && typeof u.scriptOnly !== "boolean") err(where, "scriptOnly must be true or false");
  if (u.assumes !== undefined) {
    if (!isStrArr(u.assumes) && !(Array.isArray(u.assumes) && u.assumes.length === 0)) err(where, "assumes must be an array of assumed-list names");
    else for (const n of u.assumes) if (!ctx.assumed.has(n)) err(where, `assumes "${n}": no content/assumed/${n}.json`);
    if (u.track === "script") err(where, "script units can't assume lists");
  }
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
    if (L.scriptOnly !== undefined && typeof L.scriptOnly !== "boolean") err(r, "scriptOnly must be true or false");
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
    const own = L.exercises.filter((e) => !isRecycle(e)); // hand-written
    const recycled = L.exercises.length - own.length;
    const [lo, hi] = EXERCISE_RANGE[unitLevel(u)];
    if (own.length < lo || own.length > hi)
      warn(r, `${own.length} hand-written exercises (target ${lo}–${hi}${recycled ? `, plus ${recycled} recycle` : ""})`);
    if (recycled > MAX_RECYCLE) warn(r, `${recycled} recycle exercises (max ${MAX_RECYCLE})`);
    if (L.exercises.some((e) => e.recycle !== undefined && e.recycle !== true)) err(r, `"recycle" must be true when present`);
    if (u.track === "script" && recycled) err(r, "recycle exercises belong in main-track lessons only");
    const firstRecycle = L.exercises.findIndex(isRecycle);
    if (firstRecycle >= 0 && L.exercises.slice(firstRecycle).some((e) => !isRecycle(e))) err(r, "recycle exercises must come last");
    const ids = new Set();
    L.exercises.forEach((ex, i) => {
      const w = `${r} ex[${i}]${ex.id ? ` (${ex.id})` : ""}`;
      if (!isStr(ex.id)) err(w, "missing id");
      else if (ids.has(ex.id)) err(w, "duplicate exercise id");
      else ids.add(ex.id);
      checkExercise(w, ex);
    });
    const blob = JSON.stringify(own); // recycle exercises don't count towards a new word's practice
    for (const v of L.vocab ?? []) {
      if (!v.bn) continue;
      const n = blob.split(v.bn).length - 1;
      if (n < 2) warn(r, `vocab "${v.bn}" appears ${n}× in exercises (target ≥2)`);
    }
  }
}

// ---------------------------------------------------------------- reading-track vocabulary (always enforced)
// Exercise text of reading-track lessons (recycle included) may not use words taught only in the I-track.
{
  const readingLessons = loadLessons(ctx).filter((l) => isReadingUnit(l.unit));
  for (const t of findUntaught(ctx, readingLessons))
    if (t.outsideReading) err(`${t.lesson} ${t.ex}`, `[reading-vocab] "${t.token}" is taught in ${t.outsideReading}; reading-track lessons may only use Sections 1–2, assumed lists and earlier reading units`);
}

// ---------------------------------------------------------------- strict (teaching-quality) rules
if (strict) {
  const lessons = loadLessons(ctx);
  const main = lessons.filter((l) => l.unit.track === "main");
  for (const t of findUntaught(ctx, lessons).filter((x) => !x.outsideReading)) // outsideReading ones are reported above
    serr("untaught", `${t.lesson} ${t.ex}`, `Bengali "${t.token}" shown before it is taught${t.taughtIn ? ` (taught in ${t.taughtIn})` : " (not in the lexicon)"}`);
  for (const p of findProductionFirst(main))
    serr("production-first", p.lesson, `new word "${p.word}" first appears in ${p.ex} (${p.type}), a production exercise`);
  for (const l of main) {
    const maxNew = MAX_NEW[unitLevel(l.unit)];
    if ((l.data.vocab?.length ?? 0) > maxNew) serr("too-many-new", l.id, `introduces ${l.data.vocab.length} new items (max ${maxNew})`);
    if (isReviewLesson(ctx, l.id, l.data) && (l.data.vocab?.length ?? 0) > 0)
      serr("review-new-words", l.id, `review lesson introduces ${l.data.vocab.length} new item(s): ${l.data.vocab.map((v) => v.id).join(", ")}`);
  }
  // Intermediate quality bar: sentence-level work in every lesson, and skill shares per unit.
  for (const l of main.filter((x) => unitLevel(x.unit) === "intermediate")) {
    if (isReviewLesson(ctx, l.id, l.data) || ctx.lessonInfo.get(l.id)?.planLesson?.kind === "checkpoint") continue;
    const own = l.data.exercises.filter((e) => !isRecycle(e));
    if (!own.some((e) => e.type === "reading")) serr("int-reading", l.id, "intermediate lesson has no reading exercise");
    if (!own.some((e) => e.type === "listen_meaning")) serr("int-listen", l.id, "intermediate lesson has no listen_meaning exercise");
  }
  for (const [uid, ls] of lessonsByUnit(main)) {
    const u = ctx.units.get(uid);
    if (unitLevel(u) !== "intermediate") continue;
    const t = LEVEL_TARGETS.intermediate, st = skillStats(ls);
    if (st.enToBnPct < t.enToBn) serr("int-en-to-bn", uid, `English→Bengali is ${Math.round(st.enToBnPct)}% of directed exercises (${st.enToBn}/${st.directed}; need ≥${t.enToBn}%)`);
    if (st.typedBnPct < t.typedBn) serr("int-typed", uid, `typed Bengali is ${Math.round(st.typedBnPct)}% of exercises (${st.typedBn}/${st.total}; need ≥${t.typedBn}%)`);
    if (st.sentListenPct < t.sentListen) serr("int-sentence-listening", uid, `sentence-level listening is ${Math.round(st.sentListenPct)}% of exercises (${st.sentListen}/${st.total}; need ≥${t.sentListen}%)`);
  }
  for (const c of reviewCoverage(ctx, lessons)) {
    const u = ctx.units.get(c.unit);
    const complete = u.lessons.length > 0 && (ctx.plans.get(c.unit)?.lessons ?? []).every((pl) => u.lessons.includes(pl.id));
    if (!c.reviews.length) { if (complete) serr("review-coverage", c.unit, "no review lesson (plan kind \"review\" or title starting \"Review\")"); continue; }
    if (c.pct < 80) serr("review-coverage", c.unit, `review (${c.reviews.join(", ")}) tests ${c.covered}/${c.words} unit words (${Math.round(c.pct)}%, need 80%)`);
  }
}

// ---------------------------------------------------------------- report
if (!quiet) warnings.forEach((w) => console.warn(`⚠  ${w}`));
errors.forEach((e) => console.error(`✗  ${e}`));
if (strict) console.log(`\nstrict violations by rule: ${Object.entries(strictCounts).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"}`);
const planned = [...plans.values()].reduce((n, p) => n + (p.lessons?.length ?? 0), 0);
console.log(
  `\n${course.units.length} units · ${planned} planned lessons · ${lessonCount} authored (${exCount} exercises) · ` +
  `${lexicon.size} lexicon entries · ${sentenceCount} plan sentences — ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
