#!/usr/bin/env node
// Spiral review: (re)builds recycle-tagged review exercises at the end of every main-track lesson
// (except the first lesson of the course) so earlier words keep coming back at expanding gaps.
//
// Usage: npm run recycle [-- --dry] [-- --lesson <id>] [-- --count N] [-- --count-late M] [-- --late-from <unit-prefix>]
//   --dry         report only, write nothing
//   --pairs P     also add P match_pairs recycle exercises per lesson (4 words each; far more words per exercise) (default 0)
//   --lesson <id> only write that lesson (the whole course is still simulated so counts stay consistent)
//   --count N     recycle exercises per lesson (default 3)
//   --count-late M  count for lessons from --late-from onward (default: same as --count)
//   --late-from   unit prefix where --count-late starts (default u06)
//
// Idempotent: existing `"recycle": true` exercises are removed first; hand-written exercises are never touched.
// Deterministic: random choices are seeded by lesson id.
import {
  CORE_POS, exerciseText, hasForm, isRecycle, lessonPath, loadAll, loadLessons, rng, shuffle, writeJson,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const dry = flag("dry");
const only = opt("lesson", null);
const COUNT = Number(opt("count", 3));
const COUNT_LATE = Number(opt("count-late", COUNT));
const LATE_FROM = opt("late-from", "u06");
const PAIRS = Number(opt("pairs", 0));

const ctx = loadAll();
const lessons = loadLessons(ctx);
const mainIdxs = lessons.map((l, i) => i).filter((i) => lessons[i].unit.track === "main");
const firstMain = mainIdxs[0];
if (only && !lessons.some((l) => l.id === only && l.unit.track === "main")) {
  console.error(`"${only}" is not an authored main-track lesson.`); process.exit(1);
}

// Hand-written content only (recycle exercises are rebuilt).
const hand = lessons.map((l) => l.data.exercises.filter((e) => !isRecycle(e)));
const handText = hand.map((exs) => exs.map(exerciseText).join("|"));

// Main-track teachable words, with the position (in `lessons`) of their intro lesson.
const lessonPos = new Map(lessons.map((l, i) => [l.id, i]));
const words = [];
for (const e of ctx.lexicon.values()) {
  const at = lessonPos.get(e.lesson);
  if (at === undefined || lessons[at].unit.track !== "main") continue;
  if (e.pos === "letter" || e.pos === "name") continue;
  words.push({ ...e, at, count: 0, lastSeen: at, lastRecycled: -99 });
}
const byAt = [...words].sort((a, b) => a.at - b.at);
const glossSet = (e) => new Set([e.en, ...(e.alt ?? [])].map((s) => s.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim()));
const clash = (a, b) => { const ga = glossSet(a); for (const g of glossSet(b)) if (ga.has(g)) return true; return false; };
const bt = (e) => ({ bn: e.bn, tr: e.tr, en: e.en });
// Ideal number of lessons since the word was last seen, by how often it has come back already: 1, 3, 7+ ...
const IDEAL_GAP = [1, 3, 7, 10];
// Need by number of later lessons the word has already appeared in. Words one step from "solid" (3 later
// lessons) are the cheapest to fix, but never-seen words must not starve, so they stay on top.
const NEED = [12, 9, 6, 3];

const form = (slot, lessonIdx) => (slot + lessonIdx) % 3;

function build(kind, target, pool, rand) {
  // pool: words taught at or before this lesson (main track, no letter/name)
  const others = pool.filter((d) => d.id !== target.id && d.bn !== target.bn);
  const pickDistractors = (valid, n = 3) => {
    const ok = others.filter(valid);
    const same = shuffle(ok.filter((d) => d.pos === target.pos), rand);
    const rest = shuffle(ok.filter((d) => d.pos !== target.pos), rand);
    const out = [], seen = new Set();
    for (const d of [...same, ...rest]) {
      const key = kind === "bn_to_en" ? d.en.toLowerCase() : d.bn;
      if (seen.has(key)) continue;
      seen.add(key); out.push(d);
      if (out.length === n) break;
    }
    return out.length === n ? out : null;
  };
  const place = (correct, wrong) => {
    const options = wrong.slice();
    const answer = Math.floor(rand() * (options.length + 1));
    options.splice(answer, 0, correct);
    return { options, answer };
  };
  if (kind === "bn_to_en") {
    const d = pickDistractors((x) => !clash(target, x) && x.en.toLowerCase() !== target.en.toLowerCase());
    return d && { type: "select_translation", prompt: bt(target), direction: "bn_to_en", ...place(target.en, d.map((x) => x.en)) };
  }
  if (kind === "listen") {
    const d = pickDistractors((x) => x.tr !== target.tr && x.bn !== target.bn);
    return d && { type: "listen_select", audio: bt(target), ...place(target.bn, d.map((x) => x.bn)) };
  }
  const d = pickDistractors((x) => !clash(target, x) && x.tr !== target.tr);
  return d && { type: "select_translation", prompt: bt(target), direction: "en_to_bn", ...place(target.bn, d.map((x) => x.bn)) };
}
const KINDS = ["bn_to_en", "listen", "en_to_bn"];

const unitIdx = (id) => ctx.course.units.findIndex((u) => u.id === id);
const lateIdx = ctx.course.units.findIndex((u) => u.id.startsWith(LATE_FROM));
let prevMainRecycled = new Set();
const report = [];
const writes = [];

lessons.forEach((l, i) => {
  const handHere = handText[i];
  // 1) Update counts with this lesson's hand-written appearances.
  for (const w of byAt) {
    if (w.at >= i) break;
    if (hasForm(handHere, w.bn)) { w.count++; w.lastSeen = i; }
  }
  if (l.unit.track !== "main" || i === firstMain) return;

  const n = lateIdx >= 0 && unitIdx(l.unit.id) >= lateIdx ? COUNT_LATE : COUNT;
  const rand = rng("recycle:" + l.id);
  const pool = words.filter((w) => w.at <= i);
  const cands = words.filter((w) => w.at < i && !hasForm(handHere, w.bn) && !prevMainRecycled.has(w.id));
  const scored = cands.map((w) => {
    const ideal = IDEAL_GAP[Math.min(w.count, IDEAL_GAP.length - 1)];
    const since = i - w.lastSeen;
    let s = (CORE_POS.has(w.pos) ? 2 : 0) + NEED[Math.min(w.count, NEED.length - 1)];
    s += since >= ideal ? 3 : -2 * (ideal - since);   // reward words that are "due", penalise ones seen too recently
    s += Math.min(since, 12) * 0.2;                   // neglected words drift upward
    if (w.pos === "phrase") s -= 0.5;
    return { w, s: s + rand() * 0.9 };
  }).sort((a, b) => b.s - a.s);

  const made = [];
  const used = new Set();
  for (const { w } of scored) {
    if (made.length >= n) break;
    if (used.has(w.bn)) continue;
    const slot = made.length;
    let ex = null;
    for (let k = 0; k < 3 && !ex; k++) ex = build(KINDS[(form(slot, i) + k) % 3], w, pool, rand);
    if (!ex) continue;
    used.add(w.bn);
    made.push({ w, ex: { id: `r${String(made.length + 1).padStart(2, "0")}`, ...ex, recycle: true } });
  }
  // Optional match_pairs exercises: 4 words each, unique Bengali and English, no synonyms.
  for (let p = 0; p < PAIRS; p++) {
    const group = [];
    for (const { w } of scored) {
      if (group.length >= 4) break;
      if (used.has(w.bn) || w.pos === "phrase") continue;
      if (group.some((g) => g.bn === w.bn || clash(g, w) || g.tr === w.tr)) continue;
      group.push(w);
    }
    if (group.length < 4) break;
    for (const g of group) used.add(g.bn);
    made.push({ w: group[0], more: group.slice(1), ex: { id: `r${String(made.length + 1).padStart(2, "0")}`, type: "match_pairs", pairs: shuffle(group, rand).map(bt), recycle: true } });
  }
  for (const { w, more = [] } of made) for (const x of [w, ...more]) { x.count++; x.lastSeen = i; x.lastRecycled = i; }
  prevMainRecycled = new Set(made.flatMap((m) => [m.w, ...(m.more ?? [])]).map((w) => w.id));
  report.push({
    lesson: l.id,
    words: made.map((m) => m.more ? `[pairs: ${[m.w, ...m.more].map((x) => x.bn).join(" ")}]` : `${m.w.bn} (${m.w.en}, ${m.w.count - 1} so far, intro ${lessons[m.w.at].id})`),
    shortfall: made.filter((m) => !m.more).length < n,
  });

  if (!only || only === l.id) {
    const next = { ...l.data, exercises: [...hand[i], ...made.map((m) => m.ex)] };
    writes.push({ l, next });
  }
});

for (const r of report) {
  if (only && r.lesson !== only) continue;
  console.log(`${r.lesson}${r.shortfall ? "  (SHORT)" : ""}: ${r.words.join(" | ")}`);
}
if (!dry) {
  for (const { l, next } of writes) {
    if (JSON.stringify(next) === JSON.stringify(l.data)) continue;
    writeJson(lessonPath(l.unit, l.id), next);
  }
}
console.log(`\n${dry ? "[dry run] would process" : "processed"} ${writes.length} lessons, ${writes.reduce((n, w) => n + w.next.exercises.filter(isRecycle).length, 0)} recycle exercises.`);
