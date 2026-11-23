#!/usr/bin/env node
// Validates the graded stories: content/stories/<unit-id>-story.json.
//
//   npm run validate:stories
//
// Checks: schema (title, 6–12 lines, 3–4 multiple-choice questions with a "why"); the story's unit is a
// main-track beginner unit; every Bengali word (title, lines, questionBn, Bengali options, and Bengali
// quoted in the English text) is a content/lexicon/ form taught by the END of the story's unit (course
// order, script units included; letters don't count); every `tr` matches the lexicon transliteration
// of its words; words that are spelled the same as two different lexicon entries (নয় "nine" / "is
// not") are pinned with `senses`. Questions sit after a line (`after`), in line order, and each story
// mixes English-answer and Bengali-answer questions. Exit code 1 on any error.
//
// Segmentation is greedy longest-match over the line's words, the same rule the app uses to build
// its tap-a-word glosses (web/src/lib/stories/segment.ts), so what validates is what the app glosses.
import fs from "node:fs";
import path from "node:path";
import { BENGALI, ROOT, loadAll, readJson, rel, unitLevel } from "./lib.mjs";

const errors = [];
const warnings = [];
const err = (where, m) => errors.push(`${where}: ${m}`);
const warn = (where, m) => warnings.push(`${where}: ${m}`);

const DIR = path.join(ROOT, "stories");
const LINES = [6, 12];
const QUESTIONS = [3, 4];
const OPTIONS = [2, 4];
const MAX_WHY = 280;
const PUNCT = /[।॥?!,.;:"“”'‘’()—–…/]/g;
const normBn = (s) => s.normalize("NFC").replace(PUNCT, " ").split(/\s+/).filter(Boolean);
const normTr = (s) => s.toLowerCase().replace(/[।॥?!,.;:"“”'‘’()—–…/]/g, " ").split(/\s+/).filter(Boolean);

const ctx = loadAll();
for (const p of ctx.problems) if (p.level === "error") err(p.where, p.msg);

/** Lexicon forms taught by the end of a unit: key (space-joined NFC tokens) -> entries. */
function formsFor(unit) {
  const idx = Math.max(-1, ...unit.lessons.map((id) => ctx.lessonInfo.get(id)?.index ?? -1));
  const forms = new Map();
  let maxWords = 1;
  for (const e of ctx.lexicon.values()) {
    if (e.pos === "letter" || typeof e.bn !== "string" || typeof e.tr !== "string") continue;
    const i = ctx.lessonInfo.get(e.lesson)?.index;
    if (i === undefined || i > idx) continue;
    const toks = normBn(e.bn);
    if (!toks.length) continue;
    const key = toks.join(" ");
    if (!forms.has(key)) forms.set(key, []);
    forms.get(key).push(e);
    maxWords = Math.max(maxWords, toks.length);
  }
  return { forms, maxWords };
}

/** All lexicon forms (any unit), to tell "not taught yet" from "not in the lexicon". */
const anyForm = new Map();
for (const e of ctx.lexicon.values()) {
  if (e.pos === "letter" || typeof e.bn !== "string") continue;
  const key = normBn(e.bn).join(" ");
  if (!anyForm.has(key)) anyForm.set(key, e);
}

/** Greedy longest-match segmentation. Unknown tokens become { key, entries: [] }. */
function segment(tokens, { forms, maxWords }) {
  const out = [];
  for (let i = 0; i < tokens.length; ) {
    let hit = null;
    for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
      const key = tokens.slice(i, i + n).join(" ");
      if (forms.has(key)) {
        hit = { key, entries: forms.get(key), n };
        break;
      }
    }
    if (!hit) hit = { key: tokens[i], entries: [], n: 1 };
    out.push(hit);
    i += hit.n;
  }
  return out;
}

/** True if `trWords` reads as the segments' transliterations in order (any reading of a homograph). */
function trMatches(segs, trWords) {
  const go = (s, w) => {
    if (s === segs.length) return w === trWords.length;
    const trs = new Set(segs[s].entries.map((e) => normTr(e.tr).join(" ")));
    for (const tr of trs) {
      const parts = tr.split(" ");
      if (parts.every((p, k) => trWords[w + k] === p) && go(s + 1, w + parts.length)) return true;
    }
    return false;
  };
  return go(0, 0);
}

/** Checks a { bn, tr, en } against the forms known in this unit. Returns the segments (or null). */
function checkBn(where, x, known, { senses } = {}) {
  if (!x || typeof x !== "object") {
    err(where, "must be an object { bn, tr, en }");
    return null;
  }
  for (const k of ["bn", "tr", "en"]) if (typeof x[k] !== "string" || !x[k].trim()) err(where, `missing "${k}"`);
  if (typeof x.bn !== "string" || typeof x.tr !== "string") return null;
  if (x.bn !== x.bn.normalize("NFC")) err(where, `bn "${x.bn}" is not NFC`);
  if (/[‌‍]/.test(x.bn)) err(where, `bn "${x.bn}" contains ZWJ/ZWNJ`);
  if (!BENGALI.test(x.bn)) err(where, `bn "${x.bn}" has no Bengali`);
  if (/[0-9০-৯]/.test(x.bn)) err(where, `bn "${x.bn}" has digits: write numbers as words`);
  if (typeof x.en === "string" && BENGALI.test(x.en)) err(where, `en "${x.en}" contains Bengali script`);
  if (BENGALI.test(x.tr) || x.tr !== x.tr.toLowerCase()) err(where, `tr "${x.tr}" must be lowercase Latin`);
  const segs = segment(normBn(x.bn), known);
  const missing = segs.filter((s) => !s.entries.length).map((s) => s.key);
  if (missing.length) {
    for (const m of new Set(missing)) {
      const later = anyForm.get(m);
      err(
        where,
        later
          ? `"${m}" is not taught yet in this unit (introduced in ${later.lesson}) (in "${x.bn}")`
          : `"${m}" is not in content/lexicon/ (in "${x.bn}")`,
      );
    }
    return null;
  }
  if (!trMatches(segs, normTr(x.tr))) {
    const expected = segs.map((s) => normTr(s.entries[0].tr).join(" ")).join(" ");
    err(where, `tr "${x.tr}" does not match the lexicon for "${x.bn}" (expected "${expected}")`);
  }
  // Homographs: two entries spelled alike with different meanings need a sense.
  for (const s of segs) {
    const meanings = new Set(s.entries.map((e) => e.en));
    if (meanings.size < 2) continue;
    const id = senses?.[s.key];
    if (id === undefined)
      err(where, `"${s.key}" is ambiguous (${s.entries.map((e) => `${e.id} "${e.en}"`).join(", ")}): add "senses": { "${s.key}": "<id>" }`);
  }
  if (senses !== undefined) {
    if (!senses || typeof senses !== "object" || Array.isArray(senses)) err(where, "senses must be an object { bn: lexicon id }");
    else
      for (const [bn, id] of Object.entries(senses)) {
        const key = normBn(bn).join(" ");
        const seg = segs.find((s) => s.key === key);
        if (!seg) err(where, `senses: "${bn}" is not a word of this line`);
        else if (!seg.entries.some((e) => e.id === id)) err(where, `senses: "${id}" is not a known entry spelled "${bn}" (${seg.entries.map((e) => e.id).join(", ")})`);
      }
  }
  return segs;
}

/** Bengali quoted inside English prose must also be taught forms; "-েন" style endings are allowed. */
function checkProse(where, text, known) {
  if (typeof text !== "string") return;
  if (text !== text.normalize("NFC")) err(where, "text is not NFC");
  for (const m of text.matchAll(/(-?)([ঀ-৿]+(?:\s+[ঀ-৿]+)*)/g)) {
    if (m[1] === "-") continue;
    const segs = segment(normBn(m[2]), known);
    for (const s of segs) {
      if (s.entries.length) continue;
      const later = anyForm.get(s.key);
      err(where, later ? `Bengali "${s.key}" is not taught yet in this unit` : `Bengali "${s.key}" is not in content/lexicon/`);
    }
  }
}

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const STORY_KEYS = new Set(["id", "unit", "title", "summary", "status", "reviewedBy", "lines", "questions"]);
const LINE_KEYS = new Set(["speaker", "bn", "tr", "en", "senses"]);
const Q_KEYS = new Set(["after", "question", "questionBn", "options", "answer", "why"]);

// ---------------------------------------------------------------- files
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];
const byUnit = new Map();
let nLines = 0;
let nQuestions = 0;

for (const f of files) {
  const file = path.join(DIR, f);
  const w0 = rel(file);
  let s;
  try {
    s = readJson(file);
  } catch (e) {
    err(w0, `invalid JSON: ${e.message}`);
    continue;
  }
  const id = f.replace(/\.json$/, "");
  if (s?.id !== id) err(w0, `id "${s?.id}" doesn't match file name "${id}"`);
  for (const k of Object.keys(s ?? {})) if (!STORY_KEYS.has(k)) err(w0, `unknown field "${k}"`);
  const unit = ctx.units.get(s?.unit);
  if (!unit) {
    err(w0, `unit "${s?.unit}" is not in course.json`);
    continue;
  }
  if (id !== `${unit.id}-story`) err(w0, `file must be named ${unit.id}-story.json`);
  if (unit.track !== "main") err(w0, `unit ${unit.id} is not a main-track unit`);
  if (unitLevel(unit) !== "beginner") err(w0, `unit ${unit.id} is not a beginner unit`);
  if (byUnit.has(unit.id)) err(w0, `a second story for ${unit.id} (also ${byUnit.get(unit.id)})`);
  byUnit.set(unit.id, w0);
  if (s.status !== undefined && s.status !== "draft" && s.status !== "reviewed") err(w0, 'status must be "draft" or "reviewed"');
  if (s.summary !== undefined && !isStr(s.summary)) err(w0, "summary must be a non-empty string");
  if (s.summary !== undefined && BENGALI.test(s.summary)) err(w0, "summary must be English (no Bengali script)");

  const known = formsFor(unit);
  checkBn(`${w0} title`, s.title, known, { senses: s.title?.senses });

  const lines = Array.isArray(s.lines) ? s.lines : [];
  if (!Array.isArray(s.lines) || lines.length < LINES[0] || lines.length > LINES[1])
    err(w0, `lines must be an array of ${LINES[0]}–${LINES[1]} lines (has ${lines.length})`);
  nLines += lines.length;
  lines.forEach((l, i) => {
    const w = `${w0} lines[${i}]`;
    for (const k of Object.keys(l ?? {})) if (!LINE_KEYS.has(k)) err(w, `unknown field "${k}"`);
    if (l?.speaker !== undefined && (!isStr(l.speaker) || BENGALI.test(l.speaker))) err(w, "speaker must be a non-empty English name");
    checkBn(w, l, known, { senses: l?.senses });
  });

  const qs = Array.isArray(s.questions) ? s.questions : [];
  if (!Array.isArray(s.questions) || qs.length < QUESTIONS[0] || qs.length > QUESTIONS[1])
    err(w0, `questions must be an array of ${QUESTIONS[0]}–${QUESTIONS[1]} (has ${qs.length})`);
  nQuestions += qs.length;
  let lastAfter = -1;
  let enQ = 0;
  let bnQ = 0;
  qs.forEach((q, i) => {
    const w = `${w0} questions[${i}]`;
    for (const k of Object.keys(q ?? {})) if (!Q_KEYS.has(k)) err(w, `unknown field "${k}"`);
    if (!Number.isInteger(q?.after) || q.after < 0 || q.after >= lines.length) err(w, `after must be a line index 0–${lines.length - 1}`);
    else if (q.after < lastAfter) err(w, "questions must be in line order (after must not decrease)");
    else lastAfter = q.after;
    if (!isStr(q?.question)) err(w, "missing question (English)");
    else if (BENGALI.test(q.question)) checkProse(`${w}.question`, q.question, known);
    if (q?.questionBn !== undefined) checkBn(`${w}.questionBn`, q.questionBn, known, { senses: q.questionBn?.senses });

    const opts = Array.isArray(q?.options) ? q.options : [];
    if (!Array.isArray(q?.options) || opts.length < OPTIONS[0] || opts.length > OPTIONS[1])
      err(w, `options must be an array of ${OPTIONS[0]}–${OPTIONS[1]}`);
    const allEn = opts.every((o) => typeof o === "string");
    const allBn = opts.every((o) => o && typeof o === "object");
    if (opts.length && !allEn && !allBn) err(w, "options must be all English strings or all { bn, tr, en }");
    if (allEn && opts.length) {
      enQ++;
      opts.forEach((o, k) => {
        if (!isStr(o)) err(`${w}.options[${k}]`, "empty option");
        else if (BENGALI.test(o)) err(`${w}.options[${k}]`, "English options have no Bengali script (use { bn, tr, en } for Bengali answers)");
      });
      const keys = opts.map((o) => String(o).trim().toLowerCase());
      if (new Set(keys).size !== keys.length) err(w, "options repeat");
    } else if (allBn && opts.length) {
      bnQ++;
      opts.forEach((o, k) => checkBn(`${w}.options[${k}]`, o, known, { senses: o?.senses }));
      const keys = opts.map((o) => String(o?.bn ?? "").normalize("NFC").trim());
      if (new Set(keys).size !== keys.length) err(w, "options repeat the same Bengali");
    }
    if (!Number.isInteger(q?.answer) || q.answer < 0 || q.answer >= opts.length) err(w, `answer must be an option index 0–${opts.length - 1}`);
    if (!isStr(q?.why)) err(w, 'missing "why"');
    else {
      if (q.why.length > MAX_WHY) warn(w, `why is long (${q.why.length} > ${MAX_WHY} characters)`);
      checkProse(`${w}.why`, q.why, known);
    }
  });
  if (qs.length && (!enQ || !bnQ)) err(w0, "mix the questions: at least one with English options and one with Bengali options");
}

// Every main-track beginner unit after the first should have a story.
const mains = ctx.course.units.filter((u) => u.track === "main" && unitLevel(u) === "beginner");
for (const u of mains.slice(1)) if (!byUnit.has(u.id)) warn("stories", `no story for ${u.id} (content/stories/${u.id}-story.json)`);

// ---------------------------------------------------------------- report
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`stories: ${files.length} stories, ${nLines} lines, ${nQuestions} questions · ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
