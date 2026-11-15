#!/usr/bin/env node
// Teaching-quality metrics for the authored course. Read-only.
// Usage: npm run audit [-- --words] [-- --json]
//   --words  list every under-recycled word
//   --json   machine-readable output
import fs from "node:fs";
import path from "node:path";
import {
  CORE_POS, LEVELS, LEVEL_TARGETS, MAX_NEW, ROOT, exerciseText, findProductionFirst, findUntaught, hasForm, isRecycle, lessonsByUnit,
  loadAll, loadLessons, reviewCoverage, skillStats, targetCounts, unitLevel,
} from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const ctx = loadAll();

// Authored lessons in course order.
const lessons = loadLessons(ctx);
const pos = new Map(lessons.map((l, i) => [l.id, i]));

const lessonText = lessons.map((l) => l.data.exercises.map(exerciseText).join("|"));
const contains = (i, bn) => hasForm(lessonText[i], bn);

// ---- 1. Recycling: in how many LATER lessons does each main-track word appear?
const CORE = CORE_POS;
const words = [];
for (const e of ctx.lexicon.values()) {
  const i = pos.get(e.lesson);
  if (i === undefined || lessons[i].unit.track !== "main") continue;
  if (e.pos === "letter" || e.pos === "name") continue;
  const later = [];
  for (let j = i + 1; j < lessons.length; j++) if (contains(j, e.bn)) later.push(j - i);
  words.push({ id: e.id, bn: e.bn, en: e.en, pos: e.pos, lesson: e.lesson, unit: e._unit, reuse: later.length, firstGap: later[0] ?? null, remaining: lessons.length - 1 - i });
}
const eligible = words.filter((w) => w.remaining >= 5); // words from the last few lessons can't recycle
const never = eligible.filter((w) => w.reuse === 0);
const under3 = eligible.filter((w) => w.reuse < 3);
const coreUnder3 = under3.filter((w) => CORE.has(w.pos));

// ---- 2. Load: new items per lesson
const load = lessons.map((l) => ({ id: l.id, n: l.data.vocab.length, track: l.unit.track }));
const heavy = load.filter((l) => l.n > 10);

// ---- 3. Skill balance (recycle-tagged exercises are counted separately)
const SENTENCE_TYPES = ["fill_blank", "listen_meaning", "reading"];
let clips = new Set();
try { clips = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "manifest.json"), "utf8")).items ?? {})); } catch { /* no manifest */ }
const hasClip = (bn) => clips.has(String(bn).normalize("NFC").trim());
const sent = { fillChoice: 0, fillTyped: 0, listenMeaning: 0, reading: 0, withClips: 0 };
const mix = {}; let b2e = 0, e2b = 0, typedBn = 0, total = 0, recycleCount = 0;
const recycleMix = {};
const perUnit = new Map();
for (const l of lessons) {
  const u = perUnit.get(l.unit.id) ?? { lessons: 0, ex: 0, produce: 0, listen: 0, typedBn: 0, recycle: 0, sentListen: 0 };
  u.lessons++;
  for (const ex of l.data.exercises) {
    if (isRecycle(ex)) {
      recycleCount++; u.recycle++;
      const k = ex.type + (ex.direction ? ":" + ex.direction : "");
      recycleMix[k] = (recycleMix[k] ?? 0) + 1;
      continue;
    }
    total++; u.ex++;
    mix[ex.type] = (mix[ex.type] ?? 0) + 1;
    if (ex.direction === "bn_to_en") b2e++;
    if (ex.direction === "en_to_bn") { e2b++; u.produce++; }
    if (ex.type === "listen_select") u.listen++;
    if (ex.type === "fill_blank") sent[ex.options ? "fillChoice" : "fillTyped"]++;
    // sentence-level listening: hear (listen_meaning) or read-with-audio (reading) whole sentences
    if (ex.type === "listen_meaning" || ex.type === "reading") {
      sent[ex.type === "reading" ? "reading" : "listenMeaning"]++;
      u.sentListen++;
      const texts = ex.type === "reading" ? (ex.lines ?? []).map((x) => x.bn) : [ex.audio?.bn];
      if (texts.every(hasClip)) sent.withClips++;
    }
    if (ex.type === "type_translation" && ex.direction === "en_to_bn") { typedBn++; u.typedBn++; }
  }
  perUnit.set(l.unit.id, u);
}

// ---- 4. Lesson shape: is a new word's first exercise a recognition exercise?
const productionFirst = findProductionFirst(lessons).map((p) => `${p.lesson}:${p.word}(${p.ex} ${p.type})`);

// ---- 5. Exercises using words not yet taught (prompts/options/tiles/pairs; typed `accepted` variants excluded)
const untaughtList = findUntaught(ctx, lessons);
const untaught = untaughtList.map((u) => `${u.lesson} ${u.ex}: ${u.token}${u.taughtIn ? ` (taught in ${u.taughtIn})` : " (not in lexicon)"}`);

// ---- 6. Review coverage per unit, and thinly tested targets
const coverage = reviewCoverage(ctx, lessons);
const thin = targetCounts(ctx, lessons).filter((w) => w.n <= 2);

const pct = (a, b) => `${Math.round((100 * a) / Math.max(1, b))}%`;

// ---- 7. Per level (beginner / intermediate): load, recycling and skill shares against the level's targets
const levelOf = (unitId) => unitLevel(ctx.units.get(unitId));
const levels = [];
for (const level of LEVELS) {
  const ls = lessons.filter((l) => unitLevel(l.unit) === level);
  if (!ls.length) continue;
  const t = LEVEL_TARGETS[level];
  const st = skillStats(ls);
  const lw = eligible.filter((w) => levelOf(w.unit) === level);
  const mainLs = ls.filter((l) => l.unit.track === "main");
  const units = [...lessonsByUnit(ls)].map(([id, us]) => ({ id, ...skillStats(us), track: ctx.units.get(id).track }));
  levels.push({
    level, lessons: ls.length, units: units.length, exercises: st.total,
    recycling: { words: lw.length, neverReused: lw.filter((w) => w.reuse === 0).length, under3LaterLessons: lw.filter((w) => w.reuse < 3).length },
    maxNewItems: MAX_NEW[level], heavyLessons: mainLs.filter((l) => l.data.vocab.length > MAX_NEW[level]).map((l) => l.id),
    targets: t,
    enToBnPct: Math.round(st.enToBnPct), typedBnPct: Math.round(st.typedBnPct), sentenceListeningPct: Math.round(st.sentListenPct),
    perUnit: units.filter((u) => u.track === "main").map((u) => ({ unit: u.id, exercises: u.total, enToBnPct: Math.round(u.enToBnPct), typedBnPct: Math.round(u.typedBnPct), sentenceListeningPct: Math.round(u.sentListenPct) })),
  });
}
const mark = (v, target) => (target === null ? "" : v >= target ? " ok" : " BELOW");

const report = {
  lessons: lessons.length,
  exercises: total,
  recycleExercises: recycleCount,
  recycling: { words: eligible.length, neverReused: never.length, under3LaterLessons: under3.length, coreUnder3: coreUnder3.length },
  load: { heavyLessons: heavy },
  balance: { mix, bnToEn: b2e, enToBn: e2b, typedEnToBn: typedBn },
  sentenceLevel: { ...sent, listening: sent.listenMeaning + sent.reading, listeningShare: Math.round((100 * (sent.listenMeaning + sent.reading)) / Math.max(1, total)) },
  recycleBalance: recycleMix,
  productionFirst: productionFirst.length,
  untaughtTokens: untaught.length,
  reviewCoverage: coverage.map((c) => ({ unit: c.unit, reviews: c.reviews, words: c.words, covered: c.covered, pct: Math.round(c.pct) })),
  targetsTestedAtMost2: thin.length,
  levels,
};

if (args.has("--json")) { console.log(JSON.stringify({ ...report, never: never.map((w) => w.id), untaught, productionFirstList: productionFirst, thinTargets: thin.map((w) => `${w.id} (${w.n}×)`), reviewMissing: Object.fromEntries(coverage.map((c) => [c.unit, c.missing])) }, null, 2)); process.exit(0); }

console.log(`Course: ${lessons.length} lessons, ${total} hand-written exercises + ${recycleCount} recycle exercises\n`);
console.log("RECYCLING (main-track words, excluding the last 5 lessons)");
console.log(`  never seen again after their intro lesson : ${never.length}/${eligible.length} (${pct(never.length, eligible.length)})   target 0%`);
console.log(`  seen in fewer than 3 later lessons        : ${under3.length}/${eligible.length} (${pct(under3.length, eligible.length)})   target <20%`);
console.log(`  …of which core words (pronoun/verb/particle/number/adv): ${coreUnder3.length}`);
const byUnit = new Map();
for (const w of never) byUnit.set(w.unit, (byUnit.get(w.unit) ?? 0) + 1);
console.log(`  never-reused by unit: ${[...byUnit].map(([u, n]) => `${u.split("-")[0]} ${n}`).join(" · ")}`);

console.log("\nLOAD (new items per lesson; target ≤10)");
console.log(`  over 10: ${heavy.map((l) => `${l.id} (${l.n})`).join(", ") || "none"}`);

console.log("\nSKILL BALANCE (hand-written exercises only)");
console.log(`  ${Object.entries(mix).map(([k, v]) => `${k} ${v} (${pct(v, total)})`).join(" · ")}`);
console.log(`  Bengali→English ${b2e} · English→Bengali ${e2b} (${pct(e2b, b2e + e2b)} of directed; target ≥40%) · typed English→Bengali ${typedBn} (${pct(typedBn, total)}; target ≥5%)`);
const sentListen = sent.listenMeaning + sent.reading;
console.log(`  sentence-level: fill_blank ${sent.fillChoice} choose + ${sent.fillTyped} typed · listen_meaning ${sent.listenMeaning} · reading ${sent.reading}`);
console.log(`  sentence-level listening (listen_meaning + reading): ${sentListen} (${pct(sentListen, total)} of exercises), ${sent.withClips} with recorded clips for all their Bengali`);
console.log("  per unit (production share · listening share · typed en→bn):");
for (const [id, u] of perUnit) console.log(`    ${id.padEnd(20)} ${pct(u.produce, u.ex).padStart(4)} · ${pct(u.listen, u.ex).padStart(4)} · ${u.typedBn}${u.sentListen ? `   (+ sentence-level listening ${pct(u.sentListen, u.ex)})` : ""}`);
console.log(`  recycle exercises (separate): ${recycleCount}${recycleCount ? " — " + Object.entries(recycleMix).map(([k, v]) => `${k} ${v}`).join(" · ") : ""}`);

console.log("\nLESSON SHAPE");
console.log(`  new words whose first appearance is a production exercise: ${productionFirst.length}   target 0`);
if (productionFirst.length) console.log(`    ${productionFirst.slice(0, 12).join(", ")}${productionFirst.length > 12 ? " …" : ""}`);

console.log("\nTAUGHT-BEFORE-USED (main-track exercises)");
console.log(`  Bengali words shown before they are taught: ${untaught.length}   target 0`);
for (const u of untaught.slice(0, 15)) console.log(`    ${u}`);
if (untaught.length > 15) console.log(`    … ${untaught.length - 15} more (use --json)`);

console.log("\nREVIEW COVERAGE (unit words tested as targets in the unit's review lesson(s); target ≥80%)");
for (const c of coverage)
  console.log(`  ${c.unit.padEnd(20)} ${String(Math.round(c.pct)).padStart(3)}%  ${c.covered}/${c.words}  ${c.reviews.length ? "(" + c.reviews.join(", ") + ")" : "(no review lesson)"}`);

console.log("\nTHINLY TESTED TARGETS");
console.log(`  main-track words that are a target in ≤2 exercises in the whole course: ${thin.length}   (use --words to list)`);

console.log("\nPER LEVEL (hand-written exercises; assumed-known words are not course vocabulary)");
for (const lv of levels) {
  const t = lv.targets;
  console.log(`  ${lv.level}: ${lv.units} units · ${lv.lessons} lessons · ${lv.exercises} exercises`);
  console.log(`    recycling: never seen again ${lv.recycling.neverReused}/${lv.recycling.words} · seen in <3 later lessons ${lv.recycling.under3LaterLessons}/${lv.recycling.words}`);
  console.log(`    new items per lesson: max ${lv.maxNewItems}; over: ${lv.heavyLessons.join(", ") || "none"}`);
  console.log(`    English→Bengali share of directed exercises ${lv.enToBnPct}% (target ≥${t.enToBn}%${mark(lv.enToBnPct, t.enToBn)}) · typed Bengali ${lv.typedBnPct}% (target ≥${t.typedBn}%${mark(lv.typedBnPct, t.typedBn)})` +
    (t.sentListen === null ? ` · sentence-level listening ${lv.sentenceListeningPct}%` : ` · sentence-level listening ${lv.sentenceListeningPct}% (target ≥${t.sentListen}%${mark(lv.sentenceListeningPct, t.sentListen)})`));
  if (lv.level === "intermediate") for (const u of lv.perUnit)
    console.log(`      ${u.unit.padEnd(22)} en→bn ${String(u.enToBnPct).padStart(3)}%${mark(u.enToBnPct, t.enToBn)} · typed ${String(u.typedBnPct).padStart(3)}%${mark(u.typedBnPct, t.typedBn)} · sentence listening ${String(u.sentenceListeningPct).padStart(3)}%${mark(u.sentenceListeningPct, t.sentListen)}`);
}

if (args.has("--words")) {
  console.log("\nUNDER-RECYCLED WORDS (<3 later lessons)");
  for (const w of under3.sort((a, b) => a.reuse - b.reuse || pos.get(a.lesson) - pos.get(b.lesson)))
    console.log(`  ${String(w.reuse)}×  ${w.lesson}  ${w.bn}  (${w.en})  [${w.pos}]`);
  console.log("\nTARGETS TESTED ≤2 TIMES");
  for (const w of thin.sort((a, b) => a.n - b.n)) console.log(`  ${w.n}×  ${w.lesson}  ${w.bn}  (${w.en})  [${w.pos}]`);
}
