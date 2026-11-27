#!/usr/bin/env node
// Validates the placement test bank: content/placement/items.json + config.json.
//
//   npm run validate:placement
//
// Checks: schema; exactly one correct answer per item; every Bengali word is already in the
// course (lexicon, assumed lists, lessons, plans); every audio / sentence / reading line has a
// recorded clip; and that every adaptive path through the test has enough items per band,
// score group and skill. Exit code 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { BENGALI, ROOT, blankOccurrences, readJson, rel, tokenize } from "./lib.mjs";

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const BANDS = ["A0", "A1", "A2a", "A2b", "B1"];
const SKILLS = ["listening", "reading-script", "vocabulary", "grammar"];
const GROUPS = ["listening", "reading", "grammar"];
const TYPES = new Set(["select_translation", "listen_select", "script_recognize", "listen_meaning", "fill_blank", "reading"]);
const BLOCKS = ["A", "B", "C"];

const dir = path.join(ROOT, "placement");
const load = (f) => {
  try {
    return readJson(path.join(dir, f));
  } catch (e) {
    err(`${rel(path.join(dir, f))}: ${e.message}`);
    return undefined;
  }
};
const bank = load("items.json");
const cfg = load("config.json");
const course = readJson(path.join(ROOT, "course.json"));

// ---------------------------------------------------------------- course Bengali
const tokens = new Set();
const addText = (s) => {
  if (typeof s !== "string" || !BENGALI.test(s)) return;
  for (const t of tokenize(s)) tokens.add(t);
};
const walk = (o) => {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === "object") Object.values(o).forEach(walk);
  else addText(o);
};
const jsonIn = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => path.join(d, f)) : []);
for (const f of [...jsonIn(path.join(ROOT, "lexicon")), ...jsonIn(path.join(ROOT, "assumed")), ...jsonIn(path.join(ROOT, "plans"))]) walk(readJson(f));
for (const track of ["units", "script"]) {
  const base = path.join(ROOT, track);
  if (!fs.existsSync(base)) continue;
  // Unit folders only (content/script/ also holds letter-names.json).
  for (const u of fs.readdirSync(base)) if (fs.statSync(path.join(base, u)).isDirectory()) for (const f of jsonIn(path.join(base, u))) walk(readJson(f));
}
const manifestFile = path.join(ROOT, "audio", "manifest.json");
const clips = fs.existsSync(manifestFile) ? readJson(manifestFile).items ?? {} : {};
const hasClip = (s) => s.normalize("NFC").trim() in clips;
const unitIds = new Set((course.units ?? []).map((u) => u.id));

// ---------------------------------------------------------------- config
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
function checkSlots(where, slots, needBand) {
  if (!Array.isArray(slots) || !slots.length) return err(`config ${where}: slots missing`);
  for (const s of slots) {
    if (!GROUPS.includes(s.group)) err(`config ${where}: bad group ${s.group}`);
    if (needBand ? !BANDS.includes(s.band) : s.band !== undefined && !BANDS.includes(s.band)) err(`config ${where}: bad band ${s.band}`);
    if (s.skill !== undefined && !SKILLS.includes(s.skill)) err(`config ${where}: bad skill ${s.skill}`);
    if (s.skill && cfg.skills?.[s.skill] !== s.group) err(`config ${where}: skill ${s.skill} is not in group ${s.group}`);
  }
}
function checkCuts(where, cuts, key, max, valueOk) {
  if (!Array.isArray(cuts) || !cuts.length) return err(`config ${where}: cuts missing`);
  let prev = -1;
  for (const c of cuts) {
    if (!Number.isInteger(c[key]) || c[key] <= prev) err(`config ${where}: ${key} must increase (got ${c[key]})`);
    if (!valueOk(c)) err(`config ${where}: bad target ${JSON.stringify(c)}`);
    prev = c[key];
  }
  if (prev < max) err(`config ${where}: cuts stop at ${prev}, scores go up to ${max}`);
}
if (cfg) {
  if (cfg.version !== 1) err("config: version must be 1");
  for (const k of SKILLS) if (!GROUPS.includes(cfg.skills?.[k])) err(`config skills: ${k} needs a group`);
  const bandIds = (cfg.bands ?? []).map((b) => b.id);
  if (JSON.stringify(bandIds) !== JSON.stringify(BANDS)) err(`config bands: must be ${BANDS.join(", ")} in order`);
  for (const b of cfg.bands ?? []) if (b.startUnit && !unitIds.has(b.startUnit)) err(`config bands: ${b.id} startUnit ${b.startUnit} is not in course.json`);
  const st = cfg.stages ?? {};
  checkSlots("stages.scriptCheck", st.scriptCheck?.slots, true);
  checkSlots("stages.routing", st.routing?.slots, true);
  checkSlots("stages.blockSlots", st.blockSlots, false);
  const routingMax = st.routing?.slots?.length ?? 0;
  const totalMax = routingMax + (st.blockSlots?.length ?? 0);
  checkCuts("stages.routing.cuts", st.routing?.cuts, "maxCorrect", routingMax, (c) => BLOCKS.includes(c.block));
  for (const b of BLOCKS) {
    if (!BANDS.includes(st.blocks?.[b]?.band)) err(`config stages.blocks.${b}: band missing`);
    checkCuts(`stages.final.${b}`, st.final?.[b], "maxTotal", totalMax, (c) => BANDS.includes(c.band));
  }
  const es = cfg.earlyStop ?? {};
  if (!Number.isInteger(es.bottom?.maxRoutingCorrect) || !Number.isInteger(es.bottom?.maxRoutingListeningCorrect)) err("config earlyStop.bottom: numbers missing");
  if (!BLOCKS.includes(es.top?.block) || !Number.isInteger(es.top?.minTotal)) err("config earlyStop.top: block/minTotal missing");
  const sc = cfg.scoring ?? {};
  if (!(sc.passRatio > 0 && sc.passRatio <= 1) || !Number.isInteger(sc.minItems)) err("config scoring: passRatio (0..1] and minItems needed");
  for (const [k, v] of Object.entries(cfg.routes ?? {})) for (const b of Object.values(v)) if (!BANDS.includes(b)) err(`config routes.${k}: bad band ${b}`);
  const qs = cfg.background?.questions ?? [];
  const qIds = new Set();
  for (const q of qs) {
    if (!isStr(q.id) || qIds.has(q.id)) err(`config background: bad or duplicate question id ${q.id}`);
    qIds.add(q.id);
    if (!isStr(q.text) || !Array.isArray(q.options) || q.options.length < 2) err(`config background ${q.id}: text and 2+ options needed`);
  }
  for (const rule of ["scriptCheckWhen", "heritageWhen", "varietyNoteWhen"]) {
    const r = cfg.background?.[rule];
    if (!r || !Object.keys(r).length) err(`config background.${rule} missing`);
    for (const [qid, vals] of Object.entries(r ?? {})) {
      const q = qs.find((x) => x.id === qid);
      if (!q) err(`config background.${rule}: unknown question ${qid}`);
      else for (const v of vals) if (!q.options.some((o) => o.id === v)) err(`config background.${rule}: ${qid} has no option ${v}`);
    }
  }
}

// ---------------------------------------------------------------- items
const isBnText = (t) => t && isStr(t.bn) && isStr(t.tr) && isStr(t.en) && BENGALI.test(t.bn);
const isBnOpt = (o) => BENGALI.test(o);
const items = Array.isArray(bank?.items) ? bank.items : [];
if (bank && (bank.version !== 1 || !items.length)) err("items.json: needs version 1 and a non-empty items list");
const seen = new Set();
const missingClips = new Set();

for (const it of items) {
  const where = `item ${it.id ?? "?"}`;
  if (!isStr(it.id) || !/^pl-[a-z0-9-]+$/.test(it.id)) err(`${where}: id must look like pl-…`);
  if (seen.has(it.id)) err(`${where}: duplicate id`);
  seen.add(it.id);
  if (!BANDS.includes(it.band)) err(`${where}: bad band ${it.band}`);
  if (!SKILLS.includes(it.skill)) err(`${where}: bad skill ${it.skill}`);
  if (!unitIds.has(it.unit)) err(`${where}: unit ${it.unit} is not in course.json`);
  if (!isStr(it.target)) err(`${where}: target (what it checks) missing`);
  if (it.band === "A0" && it.skill !== "reading-script") err(`${where}: A0 items are reading-script`);
  const x = it.exercise;
  if (!x || !TYPES.has(x.type)) {
    err(`${where}: exercise type must be one of ${[...TYPES].join(", ")} (no typed answers)`);
    continue;
  }
  if (x.id !== it.id) err(`${where}: exercise.id must equal the item id`);
  if (x.accepted) err(`${where}: typed answers are not used in the placement test`);

  // one correct answer
  const opts = x.options;
  if (!Array.isArray(opts) || opts.length < 3 || opts.length > 5 || !opts.every(isStr)) err(`${where}: 3–5 options needed`);
  else {
    if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= opts.length) err(`${where}: answer index out of range`);
    const norm = opts.map((o) => o.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]/gu, "").trim());
    if (new Set(norm).size !== norm.length) err(`${where}: options repeat (two could be "correct")`);
  }
  const right = opts?.[x.answer];
  const bnOptions = (opts ?? []).filter(isBnOpt);

  const shown = []; // Bengali strings shown or spoken
  const spoken = []; // strings that must have a clip
  switch (x.type) {
    case "listen_meaning":
      if (!isBnText(x.audio)) err(`${where}: audio needs bn, tr, en`);
      else {
        shown.push(x.audio.bn);
        spoken.push(x.audio.bn);
        if (right !== x.audio.en) err(`${where}: the correct option must be the audio's English`);
      }
      if (bnOptions.length) err(`${where}: listen_meaning options are English`);
      if (it.skill !== "listening") err(`${where}: listen_meaning items are listening`);
      break;
    case "listen_select":
      if (!isBnText(x.audio)) err(`${where}: audio needs bn, tr, en`);
      else {
        spoken.push(x.audio.bn);
        if (right !== x.audio.bn) err(`${where}: the correct option must be the audio's Bengali`);
      }
      if (bnOptions.length !== (opts ?? []).length) err(`${where}: listen_select options are Bengali script`);
      shown.push(...bnOptions);
      break;
    case "script_recognize":
      if (!isStr(x.glyph) || !BENGALI.test(x.glyph)) err(`${where}: glyph must be Bengali`);
      else shown.push(x.glyph);
      if (bnOptions.length) err(`${where}: script_recognize options are sounds/transliterations`);
      break;
    case "select_translation":
      if (!isBnText(x.prompt)) err(`${where}: prompt needs bn, tr, en`);
      else shown.push(x.prompt.bn);
      if (x.direction === "bn_to_en") {
        if (bnOptions.length) err(`${where}: bn_to_en options are English`);
      } else if (x.direction === "en_to_bn") {
        if (bnOptions.length !== (opts ?? []).length) err(`${where}: en_to_bn options are Bengali script`);
        if (x.prompt && right !== x.prompt.bn) err(`${where}: the correct option must be the prompt's Bengali`);
        shown.push(...bnOptions);
      } else err(`${where}: direction must be bn_to_en or en_to_bn`);
      if (it.skill === "listening") err(`${where}: select_translation is not a listening item`);
      break;
    case "fill_blank":
      if (!isBnText(x.sentence)) err(`${where}: sentence needs bn, tr, en`);
      else {
        shown.push(x.sentence.bn);
        spoken.push(x.sentence.bn);
        if (blankOccurrences(x.sentence.bn, x.blank ?? "").length !== 1) err(`${where}: blank must occur exactly once in the sentence`);
      }
      if (right !== x.blank) err(`${where}: options[answer] must equal blank`);
      if (bnOptions.length !== (opts ?? []).length) err(`${where}: fill_blank options are Bengali script`);
      shown.push(...bnOptions);
      if (it.skill !== "grammar") warn(`${where}: fill_blank is usually a grammar item`);
      break;
    case "reading": {
      const lines = x.lines;
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 8 || !lines.every(isBnText)) err(`${where}: 2–8 lines with bn, tr, en`);
      else {
        const sp = lines.filter((l) => l.speaker !== undefined).length;
        if (sp !== 0 && sp !== lines.length) err(`${where}: give every line a speaker, or none`);
        for (const l of lines) {
          shown.push(l.bn);
          spoken.push(l.bn);
        }
      }
      if (!isStr(x.question)) err(`${where}: question missing`);
      if (bnOptions.length) err(`${where}: reading options are English in the placement test`);
      if (it.skill === "listening") err(`${where}: reading is not a listening item`);
      break;
    }
  }
  for (const s of shown) {
    for (const t of tokenize(s)) if (!tokens.has(t)) err(`${where}: "${t}" is not in the course content (lexicon, lessons, plans, assumed)`);
  }
  for (const s of spoken) if (!hasClip(s)) missingClips.add(s);
  for (const s of shown) if (!spoken.includes(s) && !hasClip(s)) warn(`${where}: no clip for shown text "${s}" (not played in the test)`);
}
for (const s of missingClips) err(`no recorded clip for "${s}" (run npm run gen:audio after adding it to course content)`);

// ---------------------------------------------------------------- coverage along every path
const supply = {};
for (const it of items) {
  const g = cfg?.skills?.[it.skill];
  const k = `${it.band}|${g}`;
  supply[k] = (supply[k] ?? 0) + 1;
  const ks = `${it.band}|${g}|${it.skill}`;
  supply[ks] = (supply[ks] ?? 0) + 1;
}
let paths = 0;
if (cfg && !errors.some((e) => e.startsWith("config"))) {
  const st = cfg.stages;
  const withBand = (slots, band) => slots.map((s) => ({ ...s, band: s.band ?? band }));
  for (const script of [false, true]) {
    for (const block of BLOCKS) {
      for (const finalBand of [...new Set(st.final[block].map((c) => c.band))]) {
        paths++;
        const slots = [
          ...(script ? withBand(st.scriptCheck.slots) : []),
          ...withBand(st.routing.slots),
          ...withBand(st.blockSlots, st.blocks[block].band),
          ...withBand(st.blockSlots, finalBand),
        ];
        const need = {};
        for (const s of slots) {
          need[`${s.band}|${s.group}`] = (need[`${s.band}|${s.group}`] ?? 0) + 1;
          if (s.skill) need[`${s.band}|${s.group}|${s.skill}`] = (need[`${s.band}|${s.group}|${s.skill}`] ?? 0) + 1;
        }
        for (const [k, n] of Object.entries(need)) {
          if ((supply[k] ?? 0) < n) {
            err(`coverage: path ${script ? "script check → " : ""}routing → block ${block} → final ${finalBand} needs ${n} × ${k.replaceAll("|", " / ")}, bank has ${supply[k] ?? 0}`);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------- report
const table = {};
for (const it of items) {
  table[it.band] ??= Object.fromEntries(SKILLS.map((s) => [s, 0]));
  table[it.band][it.skill]++;
}
console.log(`Placement bank: ${items.length} items, ${paths} adaptive paths checked`);
console.log(["band", ...SKILLS].map((s) => s.padEnd(15)).join(""));
for (const b of BANDS) console.log([b, ...SKILLS.map((s) => String(table[b]?.[s] ?? 0))].map((s) => s.padEnd(15)).join(""));
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
