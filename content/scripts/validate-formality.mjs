#!/usr/bin/env node
// Validates the formality trainer bank: content/formality/scenarios.json.
//
//   npm run validate:formality
//
// Checks: schema (tiers, scenarios, BnText options, answers, "why"); answer indexes are valid and
// unique; a scenario with more than one accepted answer says so in `varies` ("Both are heard: …");
// every Bengali word (prompt, options, and Bengali quoted in the English text) is a form in
// content/lexicon/; and every `tr` matches the lexicon transliteration of its Bengali, word by word.
// Each tier needs at least `roundSize` scenarios. Exit code 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { BENGALI, ROOT, readJson, rel } from "./lib.mjs";

const errors = [];
const warnings = [];
const err = (where, m) => errors.push(`${where}: ${m}`);
const warn = (where, m) => warnings.push(`${where}: ${m}`);

const FILE = path.join(ROOT, "formality", "scenarios.json");
const BLANK = "___";
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_WHY = 320;
const PUNCT = /[।॥?!,.;:"“”'‘’()—–/]/g;

// ---------------------------------------------------------------- lexicon forms
// bn form (NFC, space-joined tokens) -> Set of tr (lowercase, punctuation-free, space-joined).
const forms = new Map();
let maxWords = 1;
const normBn = (s) => s.normalize("NFC").replace(PUNCT, " ").split(/\s+/).filter(Boolean);
const normTr = (s) => s.toLowerCase().replace(/[.?!,;:"“”()।/]/g, " ").split(/\s+/).filter(Boolean);
const lexDir = path.join(ROOT, "lexicon");
for (const f of fs.readdirSync(lexDir).filter((x) => x.endsWith(".json")).sort()) {
  let data;
  try {
    data = readJson(path.join(lexDir, f));
  } catch (e) {
    err(`lexicon/${f}`, `invalid JSON: ${e.message}`);
    continue;
  }
  for (const e of data.entries ?? []) {
    if (typeof e?.bn !== "string" || typeof e?.tr !== "string") continue;
    const toks = normBn(e.bn);
    if (!toks.length) continue;
    const key = toks.join(" ");
    if (!forms.has(key)) forms.set(key, new Set());
    forms.get(key).add(normTr(e.tr).join(" "));
    maxWords = Math.max(maxWords, toks.length);
  }
}

/**
 * Segments Bengali tokens into lexicon forms (longest match first, with backtracking).
 * Returns every segmentation as a list of { bn, trs } units; `___` is its own unit.
 * Unknown tokens are reported via `missing`.
 */
function segment(tokens) {
  const missing = [];
  const out = [];
  const memo = new Map();
  const go = (i) => {
    if (i === tokens.length) return [[]];
    if (memo.has(i)) return memo.get(i);
    const res = [];
    if (tokens[i] === BLANK) {
      for (const rest of go(i + 1)) res.push([{ bn: BLANK, trs: new Set([BLANK]) }, ...rest]);
    } else {
      for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
        const key = tokens.slice(i, i + n).join(" ");
        if (!forms.has(key)) continue;
        for (const rest of go(i + n)) res.push([{ bn: key, trs: forms.get(key) }, ...rest]);
        if (res.length > 50) break;
      }
    }
    memo.set(i, res);
    return res;
  };
  for (const t of tokens) {
    if (t === BLANK) continue;
    if (!forms.has(t) && ![...forms.keys()].some((k) => k.split(" ").includes(t))) missing.push(t);
  }
  if (missing.length) return { missing, segmentations: [] };
  for (const s of go(0)) out.push(s);
  return { missing, segmentations: out };
}

/** True if `trWords` can be read as the units' transliterations in order. */
function trMatches(units, trWords) {
  const go = (u, w) => {
    if (u === units.length) return w === trWords.length;
    for (const tr of units[u].trs) {
      const parts = tr.split(" ");
      if (parts.every((p, k) => trWords[w + k] === p) && go(u + 1, w + parts.length)) return true;
    }
    return false;
  };
  return go(0, 0);
}

/** Expected tr for a message (first lexicon reading of each unit). */
const expectedTr = (units) => units.map((u) => [...u.trs][0]).join(" ");

/** Checks one { bn, tr, en } against the lexicon. */
function checkBn(where, x, { allowBlank = false } = {}) {
  if (!x || typeof x !== "object") return err(where, "must be an object { bn, tr, en }");
  for (const k of ["bn", "tr", "en"]) {
    if (typeof x[k] !== "string" || !x[k].trim()) err(where, `missing "${k}"`);
  }
  if (typeof x.bn !== "string" || typeof x.tr !== "string") return;
  if (x.bn !== x.bn.normalize("NFC")) err(where, `bn "${x.bn}" is not NFC`);
  if (/[‌‍]/.test(x.bn)) err(where, `bn "${x.bn}" contains ZWJ/ZWNJ`);
  if (!BENGALI.test(x.bn)) err(where, `bn "${x.bn}" has no Bengali`);
  if (typeof x.en === "string" && BENGALI.test(x.en)) err(where, `en "${x.en}" contains Bengali script`);
  if (BENGALI.test(x.tr) || x.tr !== x.tr.toLowerCase()) err(where, `tr "${x.tr}" must be lowercase Latin`);
  const blankBn = x.bn.split(BLANK).length - 1;
  const blankTr = x.tr.split(BLANK).length - 1;
  if (blankBn && !allowBlank) err(where, `"${BLANK}" is only allowed in a prompt`);
  if (blankBn !== blankTr) err(where, `bn has ${blankBn} "${BLANK}" but tr has ${blankTr}`);
  const tokens = normBn(x.bn.replaceAll(BLANK, ` ${BLANK} `));
  const { missing, segmentations } = segment(tokens);
  if (missing.length) {
    err(where, `not in content/lexicon/: ${[...new Set(missing)].join(", ")} (in "${x.bn}")`);
    return;
  }
  if (!segmentations.length) {
    err(where, `"${x.bn}" can't be split into content/lexicon/ forms (a word is only part of a longer phrase there)`);
    return;
  }
  const trWords = normTr(x.tr.replaceAll(BLANK, ` ${BLANK} `));
  if (!segmentations.some((units) => trMatches(units, trWords)))
    err(where, `tr "${x.tr}" does not match the lexicon for "${x.bn}" (expected "${expectedTr(segmentations[0] ?? [])}")`);
}

/** Bengali words quoted inside English prose must also be lexicon forms; "-েন" style endings are allowed. */
function checkProse(where, text) {
  if (typeof text !== "string") return;
  if (text !== text.normalize("NFC")) err(where, "text is not NFC");
  const runs = text.matchAll(/(-?)([ঀ-৿]+(?:\s+[ঀ-৿]+)*)/g);
  for (const m of runs) {
    if (m[1] === "-") continue; // an ending such as -েন
    const tokens = normBn(m[2]);
    const { missing } = segment(tokens);
    if (missing.length) err(where, `Bengali not in content/lexicon/: ${[...new Set(missing)].join(", ")}`);
  }
}

// ---------------------------------------------------------------- file
let bank;
try {
  bank = readJson(FILE);
} catch (e) {
  err(rel(FILE), e.code === "ENOENT" ? "file not found" : `invalid JSON: ${e.message}`);
}

const where0 = rel(FILE);
const perTier = new Map();
if (bank) {
  if (bank.version !== 1) err(where0, "version must be 1");
  const roundSize = bank.roundSize;
  if (!Number.isInteger(roundSize) || roundSize < 1) err(where0, "roundSize must be a positive integer");
  if (!Number.isInteger(bank.unlockScore) || bank.unlockScore < 1 || bank.unlockScore > (roundSize ?? 0))
    err(where0, "unlockScore must be an integer between 1 and roundSize");

  const tierIds = new Set();
  if (!Array.isArray(bank.tiers) || !bank.tiers.length) err(where0, "tiers must be a non-empty array");
  else
    bank.tiers.forEach((t, i) => {
      const w = `${where0} tiers[${i}]`;
      if (t?.id !== i + 1) err(w, `id must be ${i + 1} (tiers are numbered 1, 2, 3 … in order)`);
      if (typeof t?.title !== "string" || !t.title.trim()) err(w, "missing title");
      if (typeof t?.description !== "string" || !t.description.trim()) err(w, "missing description");
      checkProse(`${w}.description`, t?.description);
      tierIds.add(t?.id);
    });

  if (!Array.isArray(bank.intro) || bank.intro.length < 1) err(where0, "intro must be a non-empty array");
  else
    bank.intro.forEach((c, i) => {
      const w = `${where0} intro[${i}]`;
      if (typeof c?.label !== "string" || !c.label.trim()) err(w, "missing label");
      if (typeof c?.use !== "string" || !c.use.trim()) err(w, "missing use");
      checkProse(`${w}.use`, c?.use);
      checkBn(`${w}.pronoun`, c?.pronoun);
      if (!Array.isArray(c?.forms) || !c.forms.length) err(w, "forms must be a non-empty array of { bn, tr, en }");
      else c.forms.forEach((f, k) => checkBn(`${w}.forms[${k}]`, f));
    });

  const ids = new Set();
  if (!Array.isArray(bank.scenarios) || !bank.scenarios.length) err(where0, "scenarios must be a non-empty array");
  for (const [i, sc] of (Array.isArray(bank.scenarios) ? bank.scenarios : []).entries()) {
    const w = `${where0} ${sc?.id ?? `scenarios[${i}]`}`;
    if (typeof sc?.id !== "string" || !ID.test(sc.id)) err(w, "id must be a lowercase slug");
    else if (ids.has(sc.id)) err(w, "duplicate id");
    else ids.add(sc.id);
    if (!tierIds.has(sc?.tier)) err(w, `tier ${sc?.tier} is not in tiers`);
    else perTier.set(sc.tier, (perTier.get(sc.tier) ?? 0) + 1);
    const known = new Set(["id", "tier", "situation", "prompt", "options", "answer", "why", "varies", "notes"]);
    for (const k of Object.keys(sc ?? {})) if (!known.has(k)) err(w, `unknown field "${k}"`);

    if (typeof sc?.situation !== "string" || !sc.situation.trim()) err(w, "missing situation");
    checkProse(`${w}.situation`, sc?.situation);
    if (sc?.prompt !== undefined) {
      checkBn(`${w}.prompt`, sc.prompt, { allowBlank: true });
      if (typeof sc.prompt?.bn === "string" && !sc.prompt.bn.includes(BLANK)) warn(`${w}.prompt`, `has no "${BLANK}" gap`);
    }

    const opts = Array.isArray(sc?.options) ? sc.options : [];
    if (!Array.isArray(sc?.options) || opts.length < 2 || opts.length > 4) err(w, "options must be an array of 2–4 { bn, tr, en }");
    opts.forEach((o, k) => checkBn(`${w}.options[${k}]`, o));
    const bns = opts.map((o) => o?.bn?.normalize("NFC"));
    if (new Set(bns).size !== bns.length) err(w, "options repeat the same Bengali");

    const ans = sc?.answer;
    if (!Array.isArray(ans) || !ans.length) err(w, "answer must be a non-empty array of option indexes");
    else {
      for (const a of ans) if (!Number.isInteger(a) || a < 0 || a >= opts.length) err(w, `answer index ${a} is not a valid option index (0–${opts.length - 1})`);
      if (new Set(ans).size !== ans.length) err(w, "answer repeats an index");
      if (ans.length >= opts.length) err(w, "every option is accepted: there must be at least one wrong option");
      if (ans.length > 1 && (typeof sc.varies !== "string" || !/^Both are heard: \S/.test(sc.varies)))
        err(w, 'more than one accepted answer: add "varies": "Both are heard: …"');
      if (ans.length === 1 && sc.varies !== undefined) err(w, '"varies" is only for scenarios with more than one accepted answer');
    }

    if (typeof sc?.why !== "string" || !sc.why.trim()) err(w, "missing why");
    else if (sc.why.length > MAX_WHY) warn(w, `why is long (${sc.why.length} > ${MAX_WHY} characters)`);
    checkProse(`${w}.why`, sc?.why);
    checkProse(`${w}.varies`, sc?.varies);
    if (sc?.notes !== undefined && (typeof sc.notes !== "string" || !sc.notes.trim())) err(w, "notes must be a non-empty string");
    checkProse(`${w}.notes`, sc?.notes);
  }

  for (const t of tierIds) {
    const n = perTier.get(t) ?? 0;
    if (Number.isInteger(roundSize) && n < roundSize) err(where0, `tier ${t} has ${n} scenarios; it needs at least roundSize (${roundSize})`);
  }
}

// ---------------------------------------------------------------- report
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
const counts = [...perTier.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => `tier ${t}: ${n}`).join(", ");
console.log(
  `formality: ${bank?.scenarios?.length ?? 0} scenarios${counts ? ` (${counts})` : ""} · ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
