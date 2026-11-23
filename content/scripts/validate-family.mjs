#!/usr/bin/env node
// Validates the "My family" kin data: content/family/kin.json (played at /family).
//
//   npm run validate:family            check the file (exit code 1 on any error)
//   node content/scripts/validate-family.mjs --audio   print the Bengali strings the page can speak (JSON)
//
// Checks: schema (varieties, pronouns, phrase templates, groups, relations); every group's questions
// lead to exactly one relation for each combination of answers; card actions point at real groups and
// answers; every Bengali word (terms, templates, and every phrase the page composes from them) is a
// form in content/lexicon/ and every `tr` matches the lexicon transliteration, word by word; Bengali
// quoted inside English notes must also be lexicon forms.
//
// Also exports familyAudioStrings(kin) for content/scripts/gen-audio.mjs, using the same composition
// rules as the app (web/src/lib/family/compose.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BENGALI, ROOT, readJson, rel } from "./lib.mjs";

export const FAMILY_FILE = path.join(ROOT, "family", "kin.json");
const PRONOUNS = ["apni", "tumi", "tui"];

// ---------------------------------------------------------------- composition (mirrors compose.ts)
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Removes the "{addr}, " / ", {addr}" slot (address by name or none). */
export function stripSlot(s, slot) {
  return s.replace(new RegExp(`^\\{${slot}\\},\\s*`), "").replace(new RegExp(`,\\s*\\{${slot}\\}`), "");
}
/** One template with an address term (BnText) or none (null). */
export function fillAddr(t, addr) {
  if (!addr) return { bn: stripSlot(t.bn, "addr"), tr: stripSlot(t.tr, "addr"), en: cap(stripSlot(t.en, "addr")) };
  return { bn: t.bn.replace("{addr}", addr.bn), tr: t.tr.replace("{addr}", addr.tr), en: t.en.replace("{addr}", cap(addr.tr)) };
}
export function fillRef(t, ref, label) {
  return { bn: t.bn.replace("{ref}", ref.bn), tr: t.tr.replace("{ref}", ref.tr), en: t.en.replace("{label}", label) };
}
export function findTemplate(kin, kind, variety, pronoun) {
  return (kin.phrases ?? []).find(
    (p) => p.kind === kind && (!p.variety || p.variety === variety) && (!p.pronouns || p.pronouns.includes(pronoun)),
  );
}
/** The pronoun spec that applies for a relation in a variety (the variety may override it). */
export const pronounSpec = (r, v) => r.terms?.[v]?.pronoun ?? r.pronoun;

/** Every Bengali string the /family page can show with a play button (default and listed choices). */
export function familyAudioStrings(kin) {
  const out = new Set();
  const add = (s) => {
    if (typeof s !== "string") return;
    const k = s.normalize("NFC").trim();
    if (k && BENGALI.test(k)) out.add(k);
  };
  for (const p of kin.pronouns ?? []) add(p.bn);
  // Bare phrases (address by name or a custom word): every template, every variety and pronoun.
  for (const v of kin.varieties ?? []) {
    for (const pr of PRONOUNS) {
      for (const k of kin.kinds ?? []) {
        const t = findTemplate(kin, k.id, v.id, pr);
        if (t) add(fillAddr(t, null).bn);
      }
    }
  }
  for (const r of kin.relations ?? []) {
    for (const v of kin.varieties ?? []) {
      const term = r.terms?.[v.id];
      if (!term) continue;
      const spec = pronounSpec(r, v.id);
      const prs = [spec?.default, ...(spec?.also ?? [])].filter((p) => PRONOUNS.includes(p));
      add(term.ref?.bn);
      for (const a of term.addr ?? []) add(a.bn);
      for (const pr of prs) {
        const intro = findTemplate(kin, "intro", v.id, pr);
        if (intro && term.ref) add(fillRef(intro, term.ref, r.label).bn);
        for (const kind of r.phrases ?? []) {
          const t = findTemplate(kin, kind, v.id, pr);
          if (!t) continue;
          if (!term.addr?.length) add(fillAddr(t, null).bn);
          for (const a of term.addr ?? []) add(fillAddr(t, a).bn);
        }
      }
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------- validation
function validate() {
  const errors = [];
  const warnings = [];
  const err = (where, m) => errors.push(`${where}: ${m}`);
  const warn = (where, m) => warnings.push(`${where}: ${m}`);
  const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const PUNCT = /[।॥?!,.;:"“”'‘’()—–/]/g;
  const SLOTS = new Set(["{addr}", "{ref}"]);
  const isStr = (x) => typeof x === "string" && x.trim().length > 0;

  // lexicon forms: bn (NFC, space-joined tokens) -> Set of tr
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
  const inSomeForm = (t) => forms.has(t) || [...forms.keys()].some((k) => k.split(" ").includes(t));

  function segment(tokens) {
    const missing = tokens.filter((t) => !SLOTS.has(t) && !inSomeForm(t));
    if (missing.length) return { missing, segmentations: [] };
    const memo = new Map();
    const go = (i) => {
      if (i === tokens.length) return [[]];
      if (memo.has(i)) return memo.get(i);
      const res = [];
      if (SLOTS.has(tokens[i])) {
        for (const rest of go(i + 1)) res.push([{ bn: tokens[i], trs: new Set([tokens[i]]) }, ...rest]);
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
    return { missing, segmentations: go(0) };
  }
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
  const spaceSlots = (s) => s.replace(/\{(addr|ref)\}/g, " {$1} ");

  /** Checks one { bn, tr, en } against the lexicon. Slots ({addr}, {ref}) only where allowed. */
  function checkBn(where, x, { slots = false, needEn = true } = {}) {
    if (!x || typeof x !== "object") return err(where, "must be an object { bn, tr, en }");
    for (const k of needEn ? ["bn", "tr", "en"] : ["bn", "tr"]) if (!isStr(x[k])) err(where, `missing "${k}"`);
    if (typeof x.bn !== "string" || typeof x.tr !== "string") return;
    if (x.bn !== x.bn.normalize("NFC")) err(where, `bn "${x.bn}" is not NFC`);
    if (/[‌‍]/.test(x.bn)) err(where, `bn "${x.bn}" contains ZWJ/ZWNJ`);
    if (!BENGALI.test(x.bn)) err(where, `bn "${x.bn}" has no Bengali`);
    if (typeof x.en === "string" && BENGALI.test(x.en)) err(where, `en "${x.en}" contains Bengali script`);
    if (BENGALI.test(x.tr) || x.tr !== x.tr.toLowerCase()) err(where, `tr "${x.tr}" must be lowercase Latin`);
    if (!slots && /\{(addr|ref|label)\}/.test(x.bn + x.tr + (x.en ?? ""))) err(where, "placeholders are only allowed in phrase templates");
    const { missing, segmentations } = segment(normBn(spaceSlots(x.bn)));
    if (missing.length) return err(where, `not in content/lexicon/: ${[...new Set(missing)].join(", ")} (in "${x.bn}")`);
    if (!segmentations.length) return err(where, `"${x.bn}" can't be split into content/lexicon/ forms`);
    const trWords = normTr(spaceSlots(x.tr));
    if (!segmentations.some((u) => trMatches(u, trWords)))
      err(where, `tr "${x.tr}" does not match the lexicon for "${x.bn}" (expected "${segmentations[0].map((u) => [...u.trs][0]).join(" ")}")`);
  }
  function checkProse(where, text) {
    if (text === undefined) return;
    if (!isStr(text)) return err(where, "must be a non-empty string");
    if (text !== text.normalize("NFC")) err(where, "text is not NFC");
    for (const m of text.matchAll(/(-?)([ঀ-৿]+(?:\s+[ঀ-৿]+)*)/g)) {
      if (m[1] === "-") continue;
      const { missing, segmentations } = segment(normBn(m[2]));
      if (missing.length) err(where, `Bengali not in content/lexicon/: ${[...new Set(missing)].join(", ")}`);
      else if (!segmentations.length) err(where, `"${m[2]}" can't be split into content/lexicon/ forms`);
    }
  }
  const checkEnglish = (where, s) => {
    if (!isStr(s)) err(where, "missing");
    else if (BENGALI.test(s)) err(where, "must be English (no Bengali script)");
  };

  let kin;
  try {
    kin = readJson(FAMILY_FILE);
  } catch (e) {
    err(rel(FAMILY_FILE), e.code === "ENOENT" ? "file not found" : `invalid JSON: ${e.message}`);
    return { errors, warnings, kin: null };
  }
  const W = rel(FAMILY_FILE);
  if (kin.version !== 1) err(W, "version must be 1");

  // varieties
  const varieties = Array.isArray(kin.varieties) ? kin.varieties : [];
  const vIds = varieties.map((v) => v?.id);
  if (!varieties.length) err(W, "varieties must be a non-empty array");
  varieties.forEach((v, i) => {
    const w = `${W} varieties[${i}]`;
    if (!isStr(v?.id) || !ID.test(v.id)) err(w, "id must be a lowercase slug");
    checkEnglish(`${w}.label`, v?.label);
    checkEnglish(`${w}.description`, v?.description);
  });
  if (new Set(vIds).size !== vIds.length) err(W, "variety ids repeat");
  if (!vIds.includes(kin.defaultVariety)) err(W, `defaultVariety "${kin.defaultVariety}" is not a variety`);

  // pronouns
  const pIds = (kin.pronouns ?? []).map((p) => p?.id);
  if (JSON.stringify(pIds) !== JSON.stringify(PRONOUNS)) err(W, `pronouns must be ${PRONOUNS.join(", ")} in that order`);
  (kin.pronouns ?? []).forEach((p, i) => {
    checkBn(`${W} pronouns[${i}]`, p);
    checkProse(`${W} pronouns[${i}].use`, p?.use);
  });

  // kinds
  const kinds = (kin.kinds ?? []).map((k) => k?.id);
  if (!kinds.length) err(W, "kinds must be a non-empty array");
  (kin.kinds ?? []).forEach((k, i) => {
    if (!isStr(k?.id) || !ID.test(k.id)) err(`${W} kinds[${i}]`, "id must be a lowercase slug");
    checkEnglish(`${W} kinds[${i}].label`, k?.label);
  });
  if (new Set(kinds).size !== kinds.length) err(W, "kind ids repeat");
  if (kinds.includes("intro")) err(W, '"intro" is the reference sentence, not a phrase kind');

  // phrase templates
  const phIds = new Set();
  for (const [i, t] of (kin.phrases ?? []).entries()) {
    const w = `${W} phrases ${t?.id ?? `[${i}]`}`;
    if (!isStr(t?.id) || !ID.test(t.id)) err(w, "id must be a lowercase slug");
    else if (phIds.has(t.id)) err(w, "duplicate id");
    else phIds.add(t.id);
    const known = new Set(["id", "kind", "variety", "pronouns", "bn", "tr", "en", "note"]);
    for (const k of Object.keys(t ?? {})) if (!known.has(k)) err(w, `unknown field "${k}"`);
    if (t?.kind !== "intro" && !kinds.includes(t?.kind)) err(w, `kind "${t?.kind}" is not in kinds (or "intro")`);
    if (t?.variety !== undefined && !vIds.includes(t.variety)) err(w, `variety "${t.variety}" is not a variety`);
    if (t?.pronouns !== undefined && (!Array.isArray(t.pronouns) || !t.pronouns.length || t.pronouns.some((p) => !PRONOUNS.includes(p))))
      err(w, `pronouns must be a non-empty list of ${PRONOUNS.join("/")}`);
    checkBn(w, t, { slots: true });
    checkProse(`${w}.note`, t?.note);
    const count = (s, slot) => (typeof s === "string" ? s.split(slot).length - 1 : 0);
    if (t?.kind === "intro") {
      if (count(t.bn, "{ref}") !== 1 || count(t.tr, "{ref}") !== 1) err(w, 'an intro needs exactly one "{ref}" in bn and tr');
      if (count(t.en, "{label}") !== 1) err(w, 'an intro needs exactly one "{label}" in en');
      if (/\{addr\}/.test(t.bn + t.tr + t.en)) err(w, 'an intro has no "{addr}"');
    } else if (typeof t?.bn === "string") {
      for (const k of ["bn", "tr", "en"]) {
        const s = t[k];
        if (count(s, "{addr}") !== 1) err(w, `${k} needs exactly one "{addr}"`);
        else if (!/^\{addr\},\s/.test(s) && !/,\s\{addr\}[।?!.]?$/.test(s))
          err(w, `${k}: "{addr}" must open the phrase ("{addr}, …") or close it (", {addr}।")`);
        if (/\{(ref|label)\}/.test(s)) err(w, `${k}: only "{addr}" is allowed here`);
      }
    }
  }
  for (const kind of [...kinds, "intro"])
    for (const v of vIds)
      for (const pr of PRONOUNS) {
        const n = (kin.phrases ?? []).filter(
          (p) => p.kind === kind && (!p.variety || p.variety === v) && (!p.pronouns || p.pronouns.includes(pr)),
        ).length;
        if (n !== 1) err(W, `phrase "${kind}" for variety ${v}, pronoun ${pr}: ${n} templates match (needs exactly 1)`);
      }

  // groups
  const groups = new Map();
  for (const [i, g] of (kin.groups ?? []).entries()) {
    const w = `${W} groups ${g?.id ?? `[${i}]`}`;
    if (!isStr(g?.id) || !ID.test(g.id)) err(w, "id must be a lowercase slug");
    else if (groups.has(g.id)) err(w, "duplicate id");
    else groups.set(g.id, g);
    checkEnglish(`${w}.title`, g?.title);
    checkEnglish(`${w}.hint`, g?.hint);
    if (!Array.isArray(g?.asks) || !g.asks.length) err(w, "asks must be a non-empty array");
    const keys = new Set();
    for (const [j, a] of (g?.asks ?? []).entries()) {
      const wa = `${w} asks[${j}]`;
      if (!isStr(a?.key) || !ID.test(a.key)) err(wa, "key must be a lowercase slug");
      else if (keys.has(a.key)) err(wa, `key "${a.key}" repeats`);
      else keys.add(a.key);
      checkEnglish(`${wa}.q`, a?.q);
      const vs = (a?.options ?? []).map((o) => o?.v);
      if (!Array.isArray(a?.options) || a.options.length < 2) err(wa, "options must have at least 2 answers");
      if (new Set(vs).size !== vs.length) err(wa, "option values repeat");
      (a?.options ?? []).forEach((o, k) => {
        if (!isStr(o?.v)) err(`${wa}.options[${k}]`, "missing v");
        checkEnglish(`${wa}.options[${k}].label`, o?.label);
      });
    }
  }
  if (!groups.size) err(W, "groups must be a non-empty array");

  // relations
  const relIds = new Set();
  const relations = Array.isArray(kin.relations) ? kin.relations : [];
  if (!relations.length) err(W, "relations must be a non-empty array");
  const byGroup = new Map();
  const checkPronounSpec = (w, p) => {
    if (!p || typeof p !== "object") return err(w, "missing pronoun { default, also, note? }");
    if (!PRONOUNS.includes(p.default)) err(w, `default must be one of ${PRONOUNS.join("/")}`);
    if (!Array.isArray(p.also) || p.also.some((x) => !PRONOUNS.includes(x))) err(w, `also must be a list of ${PRONOUNS.join("/")}`);
    else if (p.also.includes(p.default) || new Set(p.also).size !== p.also.length) err(w, "also repeats a pronoun");
    checkProse(`${w}.note`, p.note);
  };
  for (const [i, r] of relations.entries()) {
    const w = `${W} ${r?.id ?? `relations[${i}]`}`;
    if (!isStr(r?.id) || !ID.test(r.id)) err(w, "id must be a lowercase slug");
    else if (relIds.has(r.id)) err(w, "duplicate id");
    else relIds.add(r.id);
    const known = new Set(["id", "group", "gen", "gender", "pick", "label", "short", "explain", "pronoun", "phrases", "terms", "actions"]);
    for (const k of Object.keys(r ?? {})) if (!known.has(k)) err(w, `unknown field "${k}"`);
    const g = groups.get(r?.group);
    if (!g) err(w, `group "${r?.group}" is not in groups`);
    if (![-1, 0, 1, 2].includes(r?.gen)) err(w, "gen must be 2 (grandparents), 1 (parents), 0 (yours), or -1 (children)");
    if (!["m", "f"].includes(r?.gender)) err(w, 'gender must be "m" or "f"');
    checkEnglish(`${w}.label`, r?.label);
    checkEnglish(`${w}.short`, r?.short);
    checkProse(`${w}.explain`, r?.explain);
    if (!isStr(r?.explain)) err(w, "missing explain");
    checkPronounSpec(`${w}.pronoun`, r?.pronoun);
    const ph = r?.phrases;
    if (!Array.isArray(ph) || ph.length < 2 || ph.length > 4) err(w, "phrases must list 2–4 kinds");
    else {
      for (const k of ph) if (!kinds.includes(k)) err(w, `phrase kind "${k}" is not in kinds`);
      if (new Set(ph).size !== ph.length) err(w, "phrases repeat a kind");
    }
    if (g) {
      const pick = r?.pick ?? {};
      const keys = g.asks.map((a) => a.key);
      if (JSON.stringify(Object.keys(pick).sort()) !== JSON.stringify([...keys].sort())) err(w, `pick must answer exactly ${keys.join(", ")}`);
      for (const a of g.asks) if (!a.options.some((o) => o.v === pick[a.key])) err(w, `pick.${a.key} "${pick[a.key]}" is not an answer of group ${g.id}`);
      const sig = keys.map((k) => pick[k]).join("|");
      if (!byGroup.has(g.id)) byGroup.set(g.id, new Map());
      if (byGroup.get(g.id).has(sig)) err(w, `same answers as "${byGroup.get(g.id).get(sig)}" in group ${g.id}`);
      byGroup.get(g.id).set(sig, r.id);
    }
    for (const v of vIds) {
      const t = r?.terms?.[v];
      const wt = `${w}.terms.${v}`;
      if (!t) {
        err(wt, "missing");
        continue;
      }
      checkBn(`${wt}.ref`, t.ref);
      if (!Array.isArray(t.addr)) err(`${wt}.addr`, "must be an array (empty = called by name)");
      else {
        t.addr.forEach((a, k) => checkBn(`${wt}.addr[${k}]`, a));
        const bns = t.addr.map((a) => a?.bn);
        if (new Set(bns).size !== bns.length) err(`${wt}.addr`, "repeats a term");
      }
      checkProse(`${wt}.note`, t.note);
      if (t.pronoun !== undefined) checkPronounSpec(`${wt}.pronoun`, t.pronoun);
      for (const k of Object.keys(t)) if (!["ref", "addr", "note", "pronoun"].includes(k)) err(wt, `unknown field "${k}"`);
    }
    for (const k of Object.keys(r?.terms ?? {})) if (!vIds.includes(k)) err(w, `terms.${k}: not a variety`);
  }
  // every combination of a group's answers leads to exactly one relation
  for (const g of groups.values()) {
    const combos = g.asks.reduce((acc, a) => acc.flatMap((c) => a.options.map((o) => [...c, o.v])), [[]]);
    const have = byGroup.get(g.id) ?? new Map();
    for (const c of combos) if (!have.has(c.join("|"))) err(`${W} groups ${g.id}`, `no relation for answers ${c.join(" + ")}`);
  }
  // actions
  for (const r of relations) {
    for (const [j, a] of (r?.actions ?? []).entries()) {
      const w = `${W} ${r.id}.actions[${j}]`;
      checkEnglish(`${w}.label`, a?.label);
      const g = groups.get(a?.group);
      if (!g) {
        err(w, `group "${a?.group}" is not in groups`);
        continue;
      }
      for (const [k, v] of Object.entries(a.preset ?? {})) {
        const ask = g.asks.find((x) => x.key === k);
        if (!ask) err(w, `preset "${k}" is not a question of group ${g.id}`);
        else if (!ask.options.some((o) => o.v === v)) err(w, `preset ${k}="${v}" is not an answer of group ${g.id}`);
      }
    }
  }

  // every composed phrase must also pass (catches a template + term that only fail together)
  if (!errors.length) {
    for (const r of relations) {
      for (const v of vIds) {
        const term = r.terms[v];
        for (const pr of PRONOUNS) {
          const intro = findTemplate(kin, "intro", v, pr);
          checkBn(`${W} ${r.id} (${v}, ${pr}) intro`, fillRef(intro, term.ref, r.label));
          for (const kind of r.phrases) {
            const t = findTemplate(kin, kind, v, pr);
            for (const a of term.addr.length ? term.addr : [null]) checkBn(`${W} ${r.id} (${v}, ${pr}) ${kind}`, fillAddr(t, a));
          }
        }
      }
    }
  }
  return { errors, warnings, kin };
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--audio")) {
    const kin = readJson(FAMILY_FILE);
    process.stdout.write(JSON.stringify(familyAudioStrings(kin)) + "\n");
  } else {
    const { errors, warnings, kin } = validate();
    for (const w of warnings) console.warn(`warn  ${w}`);
    for (const e of errors) console.error(`error ${e}`);
    const audio = kin && !errors.length ? familyAudioStrings(kin).length : 0;
    console.log(
      `family: ${kin?.relations?.length ?? 0} relations · ${kin?.groups?.length ?? 0} groups · ${kin?.phrases?.length ?? 0} phrase templates · ${audio} speakable strings · ${errors.length} errors, ${warnings.length} warnings`,
    );
    process.exit(errors.length ? 1 : 0);
  }
}
