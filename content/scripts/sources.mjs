#!/usr/bin/env node
// Licence and attribution checks for third-party material (docs/LICENSING.md).
//
//   content/sources/licences.json    known licences; allowed=false blocks one (NC, ND, GPL…)
//   content/sources/app-credits.json fonts, models and services the app uses
//   content/library/<kind>/*.json    imported stories, words, audio, media — each needs a `source` block
//
// Used by validate.mjs (so `npm run validate` enforces it) and runnable on its own:
//   node content/scripts/sources.mjs        (exit 1 on any error)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./lib.mjs";

export const LIBRARY_KINDS = ["stories", "words", "audio", "media"];
export const CREATOR_ROLES = ["author", "illustrator", "translator", "reader", "photographer", "compiler", "designer", "editor"];
export const VARIETIES = ["bd", "in", "both"];
const APP_CREDIT_KINDS = ["font", "model", "service", "data"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Public-domain test for hosting from the US with users in Bangladesh and India.
 * US: published in year Y becomes PD on 1 Jan of Y+96 (so in 2026, published 1930 or earlier).
 * Bangladesh / India: PD on 1 Jan of (author's death year + 61).
 */
export function publicDomainProblems({ published, authorDied }, year) {
  const out = [];
  if (!Number.isInteger(published)) out.push("public-domain item needs \"published\" (year, integer)");
  else if (published > year - 96) out.push(`published ${published}: still under US copyright in ${year} (must be ${year - 96} or earlier)`);
  if (!Number.isInteger(authorDied)) out.push("public-domain item needs \"authorDied\" (year, integer; use the last surviving author)");
  else if (authorDied > year - 61) out.push(`author died ${authorDied}: still under copyright in Bangladesh/India in ${year} (must be ${year - 61} or earlier)`);
  return out;
}

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isHttps = (v) => isStr(v) && /^https:\/\/\S+$/.test(v);

function readJsonSafe(file, err, where) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    err(where, `could not read: ${e.message}`);
    return null;
  }
}

/** Checks one `source` block (library item or app credit). */
function checkSource(where, s, licences, year, err, { requireCreators = true } = {}) {
  if (!s || typeof s !== "object") return err(where, "missing source block");
  const lic = licences.get(s.licence);
  if (!isStr(s.licence)) return err(where, "missing licence");
  if (!lic) return err(where, `unknown licence "${s.licence}" (add it to content/sources/licences.json first)`);
  if (!lic.allowed) return err(where, `licence ${lic.name} is not allowed: ${lic.reason ?? "blocked"}`);
  if (!isStr(s.title)) err(where, "missing title");
  if (!isHttps(s.url)) err(where, "url must be an https:// link to where we got it");
  if (s.creators !== undefined || (lic.attribution && requireCreators)) {
    if (!Array.isArray(s.creators) || s.creators.length === 0) err(where, `${lic.name} needs creators [{ name, role }]`);
    else
      s.creators.forEach((c, i) => {
        if (!isStr(c?.name)) err(where, `creators[${i}] missing name`);
        if (!CREATOR_ROLES.includes(c?.role)) err(where, `creators[${i}] role "${c?.role}" invalid (one of ${CREATOR_ROLES.join(", ")})`);
      });
  }
  if (lic.publicDomain) publicDomainProblems(s, year).forEach((m) => err(where, m));
  return lic;
}

/**
 * Runs every licence check under `root`. Returns { errors, warnings, items }.
 * `year` defaults to the current year (the public-domain cut-offs move every 1 January).
 */
export function checkSources(root = ROOT, { year = new Date().getUTCFullYear() } = {}) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
  const rel = (f) => path.relative(root, f) || f;

  // ---- licence registry
  const licences = new Map();
  const regFile = path.join(root, "sources", "licences.json");
  if (!fs.existsSync(regFile)) {
    // Older/minimal content trees (validator tests) have no sources at all; nothing to check.
    if (fs.existsSync(path.join(root, "library"))) err("sources/licences.json", "missing (content/library needs it)");
    return { errors, warnings, items: 0 };
  }
  const reg = readJsonSafe(regFile, err, "sources/licences.json");
  for (const [i, l] of (Array.isArray(reg?.licences) ? reg.licences : []).entries()) {
    const where = `sources/licences.json [${l?.id ?? i}]`;
    if (!isStr(l?.id) || !isStr(l?.name) || !isHttps(l?.url) || typeof l?.allowed !== "boolean") {
      err(where, "each licence needs id, name, https url and allowed (boolean)");
      continue;
    }
    if (!l.allowed && !isStr(l.reason)) err(where, "blocked licence needs a reason");
    if (licences.has(l.id)) err(where, "duplicate licence id");
    licences.set(l.id, l);
  }
  if (reg && !Array.isArray(reg.licences)) err("sources/licences.json", "must have a licences array");

  // ---- app credits
  const appFile = path.join(root, "sources", "app-credits.json");
  if (fs.existsSync(appFile)) {
    const app = readJsonSafe(appFile, err, "sources/app-credits.json");
    const seen = new Set();
    for (const [i, c] of (Array.isArray(app?.credits) ? app.credits : []).entries()) {
      const where = `sources/app-credits.json [${c?.id ?? i}]`;
      if (!isStr(c?.id) || !ID.test(c.id)) err(where, "id must be a lowercase slug");
      else if (seen.has(c.id)) err(where, "duplicate id");
      else seen.add(c.id);
      if (!APP_CREDIT_KINDS.includes(c?.kind)) err(where, `kind "${c?.kind}" invalid (one of ${APP_CREDIT_KINDS.join(", ")})`);
      if (c?.kind === "service") {
        // A service we call (not content we ship): no licence, but say what it is and link its terms/docs.
        if (!isStr(c.title)) err(where, "missing title");
        if (!isHttps(c.url)) err(where, "url must be an https:// link");
      } else checkSource(where, c, licences, year, err);
    }
  }

  // ---- library items
  let items = 0;
  const libDir = path.join(root, "library");
  if (fs.existsSync(libDir)) {
    const ids = new Map();
    for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!LIBRARY_KINDS.includes(entry.name)) {
        err(`library/${entry.name}`, `unknown folder (one of ${LIBRARY_KINDS.join(", ")})`);
        continue;
      }
      const dir = path.join(libDir, entry.name);
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
        const file = path.join(dir, f);
        const where = rel(file);
        const item = readJsonSafe(file, err, where);
        if (!item) continue;
        items++;
        if (!isStr(item.id) || !ID.test(item.id)) err(where, "id must be a lowercase slug");
        else if (`${item.id}.json` !== f) err(where, `file name must be ${item.id}.json`);
        else if (ids.has(item.id)) err(where, `duplicate id (also in ${ids.get(item.id)})`);
        else ids.set(item.id, where);
        const s = item.source;
        const lic = checkSource(where, s, licences, year, err);
        if (!s || typeof s !== "object") continue;
        if (typeof s.modified !== "boolean") err(where, "source.modified must be true or false");
        else if (s.modified && lic?.attribution && !isStr(s.changes))
          err(where, `${lic.name} requires saying what we changed: add source.changes`);
        if (s.variety !== undefined && !VARIETIES.includes(s.variety)) err(where, `source.variety "${s.variety}" invalid (one of ${VARIETIES.join(", ")})`);
        if (entry.name === "stories" && s.variety === undefined) warn(where, "story has no source.variety (bd / in / both)");
        if (s.funder !== undefined && !isStr(s.funder)) err(where, "source.funder must be a string");
        if (s.publisher !== undefined && !isStr(s.publisher)) err(where, "source.publisher must be a string");
        if (s.platform !== undefined && !isStr(s.platform)) err(where, "source.platform must be a string");
      }
    }
  }
  return { errors, warnings, items };
}

// ---- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warnings, items } = checkSources();
  warnings.forEach((w) => console.warn(`⚠  ${w}`));
  errors.forEach((e) => console.error(`✗  ${e}`));
  console.log(`\nsources: ${items} library item(s) — ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
