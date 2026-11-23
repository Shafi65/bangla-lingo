#!/usr/bin/env node
// Validates the bazaar mini-game: content/bazaar/stalls.json.
//
//   npm run validate:bazaar
//
// Checks: schema (stalls, steps, options, answers, "why"); answer indexes are valid; prices are
// positive whole taka; and every Bengali line (options, seller lines, replies) is a sentence the
// course already teaches, with the same transliteration and English, so the game never adds
// Bengali that has not been through the lesson pipeline. Exit code 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { BENGALI, ROOT, readJson } from "./lib.mjs";

const errors = [];
const err = (where, m) => errors.push(`${where}: ${m}`);

const FILE = path.join(ROOT, "bazaar", "stalls.json");
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_WHY = 320;
const nfc = (s) => s.normalize("NFC").trim();

// ---------------------------------------------------------------- course sentences
// bn (NFC) -> Set of "tr\u0000en" seen anywhere in the course units.
const taught = new Map();
function collect(node) {
  if (Array.isArray(node)) return node.forEach(collect);
  if (!node || typeof node !== "object") return;
  if (typeof node.bn === "string" && typeof node.tr === "string" && typeof node.en === "string") {
    const k = nfc(node.bn);
    if (!taught.has(k)) taught.set(k, new Set());
    taught.get(k).add(`${node.tr.trim()}\u0000${node.en.trim()}`);
  }
  for (const v of Object.values(node)) collect(v);
}
const unitsDir = path.join(ROOT, "units");
for (const u of fs.readdirSync(unitsDir)) {
  const dir = path.join(unitsDir, u);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) collect(readJson(path.join(dir, f)));
}

function checkText(where, t) {
  if (!t || typeof t !== "object") return err(where, "must be { bn, tr, en }");
  for (const k of ["bn", "tr", "en"]) if (typeof t[k] !== "string" || !t[k].trim()) err(where, `missing ${k}`);
  if (typeof t.bn !== "string") return;
  if (!BENGALI.test(t.bn)) err(where, `bn is not Bengali: ${t.bn}`);
  const forms = taught.get(nfc(t.bn));
  if (!forms) return err(where, `"${t.bn}" is not a sentence taught in content/units/`);
  if (!forms.has(`${(t.tr ?? "").trim()}\u0000${(t.en ?? "").trim()}`)) {
    const [tr, en] = [...forms][0].split("\u0000");
    err(where, `"${t.bn}" differs from the course: expected tr "${tr}", en "${en}"`);
  }
}

const isInt = (n) => Number.isInteger(n) && n > 0;

let data;
try {
  data = readJson(FILE);
} catch (e) {
  console.error(`bazaar/stalls.json: ${e.message}`);
  process.exit(1);
}

if (data.version !== 1) err("stalls.json", "version must be 1");
for (const k of ["coinsPerStep", "haggleBonus"]) if (!isInt(data[k])) err("stalls.json", `${k} must be a positive integer`);
if (!Array.isArray(data.stalls) || data.stalls.length < 3) err("stalls.json", "needs at least 3 stalls");

const ids = new Set();
for (const [si, s] of (data.stalls ?? []).entries()) {
  const w = `stall ${s?.id ?? si}`;
  if (!ID.test(s?.id ?? "")) err(w, "id must be kebab-case");
  if (ids.has(s.id)) err(w, "duplicate id");
  ids.add(s.id);
  for (const k of ["title", "item", "intro"]) if (typeof s[k] !== "string" || !s[k].trim()) err(w, `missing ${k}`);
  if (typeof s.unit !== "string") err(w, "unit must be a string (may be empty)");
  if (!isInt(s.start)) err(w, "start price must be a positive whole number of taka");
  if (!Array.isArray(s.steps) || s.steps.length < 2) {
    err(w, "needs at least 2 steps");
    continue;
  }
  if (!s.steps.some((st) => st.kind === "listen")) err(w, "needs a listen step (understanding the price)");
  let last = s.start;
  for (const [i, st] of s.steps.entries()) {
    const ws = `${w} step ${i + 1}`;
    if (typeof st.prompt !== "string" || !st.prompt.trim()) err(ws, "missing prompt");
    if (typeof st.why !== "string" || !st.why.trim()) err(ws, "missing why");
    else if (st.why.length > MAX_WHY) err(ws, `why is over ${MAX_WHY} characters`);
    if (st.say !== undefined) checkText(`${ws} say`, st.say);
    if (st.reply !== undefined) checkText(`${ws} reply`, st.reply);
    if (st.kind === "listen") {
      if (!st.say) err(ws, "a listen step needs `say`");
      if (!Array.isArray(st.choices) || st.choices.length < 2 || st.choices.some((c) => typeof c !== "string" || !c.trim())) err(ws, "choices must be 2+ strings");
      else if (new Set(st.choices).size !== st.choices.length) err(ws, "duplicate choices");
      if (!Number.isInteger(st.answer) || st.answer < 0 || st.answer >= (st.choices?.length ?? 0)) err(ws, "answer out of range");
    } else if (st.kind === "choose") {
      if (!Array.isArray(st.options) || st.options.length < 2) err(ws, "options must be 2+ { bn, tr, en }");
      else {
        st.options.forEach((o, j) => checkText(`${ws} option ${j + 1}`, o));
        if (new Set(st.options.map((o) => nfc(o.bn ?? ""))).size !== st.options.length) err(ws, "duplicate options");
      }
      if (!Number.isInteger(st.answer) || st.answer < 0 || st.answer >= (st.options?.length ?? 0)) err(ws, "answer out of range");
    } else err(ws, `unknown kind "${st.kind}" (choose | listen)`);
    if (st.price !== undefined) {
      if (!isInt(st.price)) err(ws, "price must be a positive whole number of taka");
      else if (st.haggle === true && st.price >= last) err(ws, `a haggle must lower the price (was ${last})`);
      else last = st.price;
    }
    if (st.haggle !== undefined && st.haggle !== true) err(ws, "haggle must be true when present");
    if (st.haggle === true && st.price === undefined) err(ws, "a haggle step needs a price");
  }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nbazaar: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`bazaar: ${data.stalls.length} stalls, ${data.stalls.reduce((n, s) => n + s.steps.length, 0)} steps OK`);
