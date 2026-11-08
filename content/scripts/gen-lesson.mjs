#!/usr/bin/env node
// Build a DRAFT lesson from its plan + lexicon, following the recipe in docs/LESSON_PIPELINE.md.
// Usage: npm run gen:lesson -- <lesson-id> [--force] [--dry]
import fs from "node:fs";
import { BENGALI, enKey, enTiles, stripParens, knownAt, lessonPath, loadAll, readJson, rel, rng, shuffle, tokenize, writeJson } from "./lib.mjs";

const args = process.argv.slice(2);
const lessonId = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const dry = args.includes("--dry");
let MAX = 14;

if (!lessonId) { console.error("usage: npm run gen:lesson -- <lesson-id> [--force] [--dry]"); process.exit(1); }
const ctx = loadAll();
const info = ctx.lessonInfo.get(lessonId);
if (!info?.planLesson) { console.error(`No plan found for ${lessonId}. Add it to content/plans/<unit>.json first.`); process.exit(1); }
const { unit, planLesson: P } = info;
const out = lessonPath(unit, lessonId);
if (fs.existsSync(out) && !force && !dry) { console.error(`${rel(out)} exists — use --force to overwrite.`); process.exit(1); }

const rand = rng(lessonId);
const pick = (arr, n) => shuffle(arr, rand).slice(0, n);
const lex = (id) => {
  const e = ctx.lexicon.get(id);
  if (!e) { console.error(`lexicon id "${id}" missing`); process.exit(1); }
  return e;
};
const bt = (e) => ({ bn: e.bn, tr: e.tr, en: e.en });
const glosses = (e) => new Set([e.en, ...(e.alt ?? [])].map((s) => s.toLowerCase()));

const newE = P.new.map(lex);
const reviewE = P.review.map(lex);
const previewE = (P.preview ?? []).map(lex);
// Main-track lessons draw distractors only from main-track words (not alphabet example words).
const known = knownAt(ctx, lessonId).filter((e) => unit.track === "script" || ctx.units.get(e._unit)?.track === "main");
const knownWords = known.filter((e) => e.pos !== "phrase" && e.pos !== "letter" && !e.bn.includes(" "));
const isScript = unit.track === "script";

// Options helper: correct + 3 distractors, correct placed at a random index.
function options(correct, pool, n = 3) {
  const opts = pick([...new Set(pool.filter((x) => x && x !== correct))], n);
  const answer = Math.floor(rand() * (opts.length + 1));
  opts.splice(answer, 0, correct);
  return { options: opts, answer };
}
// Prefer distractors of the same part of speech.
function distractorEntries(e, pool) {
  const ok = pool.filter((d) => d.id !== e.id && d.bn !== e.bn && !glosses(e).has(d.en.toLowerCase()) && d.tr !== e.tr);
  const same = ok.filter((d) => d.pos === e.pos);
  return same.length >= 3 ? same : ok;
}

const ex = [];
const add = (o) => ex.push({ id: `e${String(ex.length + 1).padStart(2, "0")}`, ...o });

const sentences = P.sentences ?? [];
const sentenceBudget = isScript ? 0 : Math.min(sentences.length, 6);
const letters = newE.filter((e) => e.pos === "letter");
const words = newE.filter((e) => e.pos !== "letter" && e.pos !== "name");
// 1+2) Item exercises, round-robin so every new item gets its 1st exercise before any gets a 2nd.
const letterPool = known.filter((e) => e.pos === "letter");
const wordPool = [...knownWords, ...known.filter((k) => k.pos === "phrase"), ...previewE];
if (isScript) MAX = 15;
const itemEx = (e) => e.pos === "letter"
  ? [
      () => { const o = options(e.tr, distractorEntries(e, letterPool).map((d) => d.tr)); return o.options.length >= 2 && { type: "script_recognize", glyph: e.bn, ...o }; },
      () => { const o = options(e.bn, distractorEntries(e, letterPool).map((d) => d.bn)); return o.options.length >= 2 && { type: "listen_select", audio: bt(e), ...o }; },
    ]
  : [
      () => ({ type: "select_translation", prompt: bt(e), direction: "bn_to_en", ...options(e.en, distractorEntries(e, wordPool).map((d) => d.en)) }),
      () => ({ type: "listen_select", audio: bt(e), ...options(e.bn, distractorEntries(e, isScript ? wordPool : knownWords).map((d) => d.bn)) }),
    ];
let items = [...letters, ...words, ...previewE.filter((e) => e.pos !== "letter")];
// Review lessons (few/no new items): exercise a sample of the review list instead.
if (items.length < 5) items = [...items, ...shuffle(reviewE.filter((e) => e.pos !== "name"), rand).slice(0, 10 - items.length)];
let wordBudget = MAX - sentenceBudget - 1 /* match */;
for (let round = 0; round < 2; round++) {
  for (const e of items) {
    if (wordBudget <= 0) break;
    const made = itemEx(e)[round]();
    if (made) { add(made); wordBudget--; }
  }
}
// Count how often each new item is exercised, so match_pairs can favour the under-practised ones.
const practiced = (e) => JSON.stringify(ex).split(e.bn).length - 1;
// 3) Match pairs: new first, topped up with review, unique bn and en
{
  const seenBn = new Set(), seenEn = new Set(), pairs = [];
  for (const e of [...[...newE].filter((x) => x.pos !== "name").sort((a, b) => practiced(a) - practiced(b)), ...shuffle(reviewE, rand), ...shuffle(knownWords, rand)]) {
    if (pairs.length >= 5) break;
    if (seenBn.has(e.bn) || seenEn.has(e.en.toLowerCase()) || [...seenEn].some((g) => glosses(e).has(g))) continue;
    seenBn.add(e.bn); seenEn.add(e.en.toLowerCase()); pairs.push(bt(e));
  }
  if (pairs.length >= 4) add({ type: "match_pairs", pairs: shuffle(pairs, rand) });
}
// 4) Sentences
const S = shuffle(sentences, rand).slice(0, sentenceBudget);
const enWordPool = [...new Set(sentences.flatMap((s) => enTiles(s.en)).concat(knownWords.map((e) => e.en).filter((w) => !w.includes(" "))))];
const bnWordPool = [...new Set(knownWords.map((e) => e.bn))];
const plan = ["word_bank_bn", "word_bank_en", "word_bank_bn", "type_bn", "word_bank_en", "select_en"];
S.forEach((s, i) => {
  const kind = plan[i % plan.length];
  const prompt = { bn: s.bn, tr: s.tr, en: s.en };
  if (kind === "word_bank_bn") {
    const answer = enTiles(s.en);
    // never offer a distractor that would form another accepted translation (He/She, I'm/I am…)
    const lower = new Set([s.en, ...(s.alt ?? [])].flatMap(enTiles).map((w) => w.toLowerCase()));
    const distract = pick(enWordPool.filter((w) => !lower.has(w.toLowerCase())), 3);
    add({ type: "word_bank", prompt, direction: "bn_to_en", tiles: shuffle([...answer, ...distract], rand), answer });
  } else if (kind === "word_bank_en") {
    const answer = tokenize(s.bn);
    const distract = pick(bnWordPool.filter((w) => !answer.includes(w)), 3);
    add({ type: "word_bank", prompt, direction: "en_to_bn", tiles: shuffle([...answer, ...distract], rand), answer });
  } else if (kind === "type_bn") {
    add({ type: "type_translation", prompt, direction: "bn_to_en", accepted: [...new Set([s.en, ...(s.alt ?? [])].flatMap((a) => [a, stripParens(a)]))] });
  } else {
    const others = sentences.concat(...[...ctx.plans.values()].flatMap((p) => p.lessons).filter((l) => (ctx.lessonInfo.get(l.id)?.index ?? 1e9) < info.index).map((l) => l.sentences ?? []))
      .filter((x) => x.bn !== s.bn && BENGALI.test(x.bn) && ![x.en, ...(x.alt ?? [])].some((a) => [s.en, ...(s.alt ?? [])].some((b) => enKey(a) === enKey(b))))
      .map((x) => x.bn);
    add({ type: "select_translation", prompt, direction: "en_to_bn", ...options(s.bn, others) });
  }
});

const lesson = {
  id: lessonId,
  unit: unit.id,
  title: P.title,
  status: "draft",
  ...(P.tip ? { tip: P.tip } : {}),
  vocab: newE.map((e) => ({ id: e.id, bn: e.bn, tr: e.tr, en: e.en, ...(e.notes ? { notes: e.notes } : {}) })),
  exercises: ex,
};

if (dry) { console.log(JSON.stringify(lesson, null, 2)); process.exit(0); }
writeJson(out, lesson);

// Register in course.json in plan order.
const coursePath = new URL("../course.json", import.meta.url);
const course = readJson(coursePath);
const u = course.units.find((x) => x.id === unit.id);
if (!u.lessons.includes(lessonId)) {
  const planOrder = ctx.plans.get(unit.id).lessons.map((l) => l.id);
  u.lessons = [...u.lessons, lessonId].sort((a, b) => planOrder.indexOf(a) - planOrder.indexOf(b));
  writeJson(coursePath.pathname, course);
}
const counts = ex.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
console.log(`✓ wrote ${rel(out)} — ${ex.length} exercises ${JSON.stringify(counts)}\n  Next: curate distractors & grammar exercises, then npm run validate.`);
