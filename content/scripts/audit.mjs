#!/usr/bin/env node
// Teaching-quality metrics for the authored course. Read-only.
// Usage: npm run audit [-- --words] [-- --json]
//   --words  list every under-recycled word
//   --json   machine-readable output
import fs from "node:fs";
import { BENGALI, lessonPath, loadAll, readJson, tokenize } from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const ctx = loadAll();

// Authored lessons in course order.
const lessons = [];
for (const u of ctx.course.units) {
  for (const id of u.lessons) {
    const f = lessonPath(u, id);
    if (fs.existsSync(f)) lessons.push({ id, unit: u, data: readJson(f) });
  }
}
const pos = new Map(lessons.map((l, i) => [l.id, i]));

// Bengali tokens a learner actually meets in an exercise (prompts, options, tiles, pairs).
function exerciseTokens(ex) {
  const out = [];
  const add = (s) => typeof s === "string" && BENGALI.test(s) && out.push(...tokenize(s).filter((t) => BENGALI.test(t)));
  add(ex.prompt?.bn); add(ex.audio?.bn); add(ex.glyph);
  for (const o of ex.options ?? []) add(o);
  for (const t of ex.tiles ?? []) add(t);
  for (const p of ex.pairs ?? []) add(p.bn);
  return out;
}
/** All Bengali text of an exercise as one space-padded token string (for whole-word phrase search). */
const exerciseText = (ex) => ` ${exerciseTokens(ex).join(" ")} `;
const lessonTokens = lessons.map((l) => {
  const set = new Set();
  for (const ex of l.data.exercises) for (const t of exerciseTokens(ex)) set.add(t);
  return set;
});
const lessonText = lessons.map((l) => l.data.exercises.map(exerciseText).join("|"));
const contains = (i, bn) => lessonText[i].includes(` ${tokenize(bn).join(" ")} `);

// ---- 1. Recycling: in how many LATER lessons does each main-track word appear?
const CORE = new Set(["pronoun", "verb", "particle", "postposition", "number", "adv"]);
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

// ---- 3. Skill balance
const mix = {}; let b2e = 0, e2b = 0, typedBn = 0, total = 0;
const perUnit = new Map();
for (const l of lessons) {
  const u = perUnit.get(l.unit.id) ?? { lessons: 0, ex: 0, produce: 0, listen: 0, typedBn: 0 };
  u.lessons++;
  for (const ex of l.data.exercises) {
    total++; u.ex++;
    mix[ex.type] = (mix[ex.type] ?? 0) + 1;
    if (ex.direction === "bn_to_en") b2e++;
    if (ex.direction === "en_to_bn") { e2b++; u.produce++; }
    if (ex.type === "listen_select") u.listen++;
    if (ex.type === "type_translation" && ex.direction === "en_to_bn") { typedBn++; u.typedBn++; }
  }
  perUnit.set(l.unit.id, u);
}

// ---- 4. Lesson shape: is a new word's first exercise a recognition exercise?
const RECOG = new Set(["select_translation:bn_to_en", "match_pairs:", "listen_select:", "script_recognize:"]);
const productionFirst = [];
for (const l of lessons) {
  for (const v of l.data.vocab) {
    const first = l.data.exercises.find((ex) => exerciseText(ex).includes(` ${tokenize(v.bn).join(" ")} `));
    if (!first) continue;
    const key = `${first.type}:${first.direction ?? ""}`;
    const isTarget = first.prompt?.bn?.includes(v.bn) || first.audio?.bn?.includes(v.bn) || first.glyph === v.bn || (first.pairs ?? []).some((p) => p.bn === v.bn);
    if (!RECOG.has(key) && !(key === "select_translation:en_to_bn" && !isTarget)) productionFirst.push(`${l.id}:${v.id}(${first.id} ${first.type})`);
  }
}

// ---- 5. Exercises using words not yet taught (prompts/options/tiles/pairs; typed `accepted` variants excluded)
const untaught = [];
{
  const introAt = new Map(); // token -> earliest lesson index (any track; script previews count from their own lesson)
  for (const e of ctx.lexicon.values()) {
    const i = pos.get(e.lesson);
    if (i === undefined) continue;
    for (const t of tokenize(e.bn)) if (!introAt.has(t) || introAt.get(t) > i) introAt.set(t, i);
  }
  lessons.forEach((l, i) => {
    if (l.unit.track === "script") return; // script lessons legitimately preview later words and build syllables
    for (const ex of l.data.exercises) {
      for (const t of exerciseTokens(ex)) {
        const at = introAt.get(t);
        if (at === undefined || at > i) untaught.push(`${l.id} ${ex.id}: ${t}${at === undefined ? " (not in lexicon)" : ` (taught in ${lessons[at].id})`}`);
      }
    }
  });
}

const pct = (a, b) => `${Math.round((100 * a) / Math.max(1, b))}%`;
const report = {
  lessons: lessons.length,
  exercises: total,
  recycling: { words: eligible.length, neverReused: never.length, under3LaterLessons: under3.length, coreUnder3: coreUnder3.length },
  load: { heavyLessons: heavy },
  balance: { mix, bnToEn: b2e, enToBn: e2b, typedEnToBn: typedBn },
  productionFirst: productionFirst.length,
  untaughtTokens: untaught.length,
};

if (args.has("--json")) { console.log(JSON.stringify({ ...report, never: never.map((w) => w.id), untaught, productionFirstList: productionFirst }, null, 2)); process.exit(0); }

console.log(`Course: ${lessons.length} lessons, ${total} exercises\n`);
console.log("RECYCLING (main-track words, excluding the last 5 lessons)");
console.log(`  never seen again after their intro lesson : ${never.length}/${eligible.length} (${pct(never.length, eligible.length)})   target 0%`);
console.log(`  seen in fewer than 3 later lessons        : ${under3.length}/${eligible.length} (${pct(under3.length, eligible.length)})   target <20%`);
console.log(`  …of which core words (pronoun/verb/particle/number/adv): ${coreUnder3.length}`);
const byUnit = new Map();
for (const w of never) byUnit.set(w.unit, (byUnit.get(w.unit) ?? 0) + 1);
console.log(`  never-reused by unit: ${[...byUnit].map(([u, n]) => `${u.split("-")[0]} ${n}`).join(" · ")}`);

console.log("\nLOAD (new items per lesson; target ≤10)");
console.log(`  over 10: ${heavy.map((l) => `${l.id} (${l.n})`).join(", ") || "none"}`);

console.log("\nSKILL BALANCE");
console.log(`  ${Object.entries(mix).map(([k, v]) => `${k} ${v} (${pct(v, total)})`).join(" · ")}`);
console.log(`  Bengali→English ${b2e} · English→Bengali ${e2b} (${pct(e2b, b2e + e2b)} of directed; target ≥40%) · typed English→Bengali ${typedBn} (${pct(typedBn, total)}; target ≥5%)`);
console.log("  per unit (production share · listening share · typed en→bn):");
for (const [id, u] of perUnit) console.log(`    ${id.padEnd(20)} ${pct(u.produce, u.ex).padStart(4)} · ${pct(u.listen, u.ex).padStart(4)} · ${u.typedBn}`);

console.log("\nLESSON SHAPE");
console.log(`  new words whose first appearance is a production exercise: ${productionFirst.length}   target 0`);
if (productionFirst.length) console.log(`    ${productionFirst.slice(0, 12).join(", ")}${productionFirst.length > 12 ? " …" : ""}`);

console.log("\nTAUGHT-BEFORE-USED (main-track exercises)");
console.log(`  Bengali words shown before they are taught: ${untaught.length}   target 0`);
for (const u of untaught.slice(0, 15)) console.log(`    ${u}`);
if (untaught.length > 15) console.log(`    … ${untaught.length - 15} more (use --json)`);

if (args.has("--words")) {
  console.log("\nUNDER-RECYCLED WORDS (<3 later lessons)");
  for (const w of under3.sort((a, b) => a.reuse - b.reuse || pos.get(a.lesson) - pos.get(b.lesson)))
    console.log(`  ${String(w.reuse)}×  ${w.lesson}  ${w.bn}  (${w.en})  [${w.pos}]`);
}
