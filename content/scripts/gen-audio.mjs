#!/usr/bin/env node
// Pre-generate Bengali audio clips with the Azure Speech REST API.
//
//   npm run gen:audio            synthesize missing clips
//   npm run gen:audio -- --dry   only count strings and characters (no API calls)
//   npm run gen:audio -- --test  synthesize one sample clip to a temp file (checks key/region/voice)
//   npm run gen:audio:audition   synthesize candidate letter-name renderings to audio-audition/ (see below)
//   npm run gen:audio:audition -- ড় ঢ়   same, with extra letters; add --dry to only print the candidates
//
// Env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (required unless --dry),
//      AZURE_VOICE (default "bn-BD-NabanitaNeural").
//
// Writes web/public/audio/<sha1(text)>.mp3 and content/audio/manifest.json:
//   { "voice": "<voice>", "items": { "<NFC text>": "<sha1>.mp3" } }
// Incremental: clips that already exist for the same voice are skipped. If the
// voice changes, every clip is regenerated. Clips no longer referenced are removed.
//
// Letter names: every letter and sign in content/script/letter-names.json also gets a clip under the
// key "letter:<glyph>", spoken as its name (ক → kɔ, ঙ → uŋɔ, ি → i-kar) rather than the bare sound.
// The app plays that key when it plays a letter by itself; a one-letter word keeps its plain key.
// How each name is spoken is a per-letter `strategy` (a–e, see the file's "strategies"), with a
// default per kind. A letter clip's file name hashes the key and what is spoken, so changing a
// strategy makes a new clip on the next run and the old one is removed as stale.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BENGALI, ROOT, lessonPath, loadAll, readJson, rel, writeJson } from "./lib.mjs";
import { FAMILY_FILE, familyAudioStrings } from "./validate-family.mjs";

// Load KEY=VALUE pairs from the repo-root .env (git-ignored) without overriding real env vars.
{
  const envFile = path.join(path.dirname(ROOT), ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const DRY = process.argv.includes("--dry");
const TEST = process.argv.includes("--test");
const AUDITION = process.argv.includes("--audition");
const VOICE = process.env.AZURE_VOICE || "bn-BD-NabanitaNeural";
const VOICE_LANG = VOICE.split("-").slice(0, 2).join("-") || "bn-BD";
const FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const CONCURRENCY = 4;
const MAX_TRIES = 6;

const AUDIO_DIR = path.join(ROOT, "..", "web", "public", "audio");
const MANIFEST = path.join(ROOT, "audio", "manifest.json");
const LETTER_NAMES = path.join(ROOT, "script", "letter-names.json");
const AUDITION_DIR = path.join(ROOT, "..", "audio-audition"); // git-ignored
/** Letters the audition renders unless others are named on the command line. */
const AUDITION_LETTERS = ["ক", "থ", "ঙ", "ঞ", "শ", "ং", "ি", "অ"];

// Marks that can't be spoken on their own: synthesize a stand-in instead (tried in order).
// The clip is still stored under the original text, so the app finds it. Change a stand-in → delete its clip to regenerate.
const SPEAK_AS = {
  "ং": ["অং", "অনুস্বার"], // onushshar: the "ng" of অং (ong)
  "ঃ": ["আঃ", "বিসর্গ"], // bishorgo: the short breath of আঃ (ah!)
};

// Bengali strings the app speaks that are not lesson content.
// Keep in sync with the voice sample in web/src/components/SettingsPanel.tsx.
const APP_STRINGS = ["বাংলা"];

/** Same normalisation the app uses before looking a string up. */
export const audioKey = (s) => s.normalize("NFC").trim();
const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");

// ---------------------------------------------------------------------------
// Letter names (content/script/letter-names.json)

/** Manifest key of a letter's name clip; the app builds the same key (web/src/lib/letterNames.ts). */
export const LETTER_PREFIX = "letter:";
const STRATEGIES = ["a", "b", "c", "d", "e"];
const KINDS = ["vowel", "consonant", "sign", "mark"];

/** Reads and checks the table; returns { defaults, letters: Map<glyph, entry> }. Missing file → no letters. */
export function loadLetterNames(file = LETTER_NAMES) {
  if (!fs.existsSync(file)) return { defaults: {}, letters: new Map() };
  const doc = readJson(file);
  const problems = [];
  const defaults = doc.defaults ?? {};
  for (const k of KINDS) if (!STRATEGIES.includes(defaults[k])) problems.push(`defaults.${k} must be one of ${STRATEGIES.join(", ")}`);
  const letters = new Map();
  for (const [i, e] of (Array.isArray(doc.letters) ? doc.letters : []).entries()) {
    const where = `letters[${i}]${e?.glyph ? ` (${e.glyph})` : ""}`;
    if (typeof e?.glyph !== "string" || !BENGALI.test(e.glyph)) { problems.push(`${where}: glyph must be Bengali`); continue; }
    const glyph = audioKey(e.glyph);
    if (glyph !== e.glyph) problems.push(`${where}: glyph must be NFC and trimmed`);
    if (letters.has(glyph)) problems.push(`${where}: duplicate glyph`);
    if (!KINDS.includes(e.kind)) problems.push(`${where}: kind must be one of ${KINDS.join(", ")}`);
    if (typeof e.tr !== "string" || !e.tr) problems.push(`${where}: tr is required`);
    if (e.strategy !== undefined && !STRATEGIES.includes(e.strategy)) problems.push(`${where}: strategy must be one of ${STRATEGIES.join(", ")}`);
    if ((e.kind === "sign" || e.kind === "mark") && typeof e.name !== "string") problems.push(`${where}: signs and marks need a name`);
    letters.set(glyph, { ...e, glyph });
  }
  if (problems.length) throw new Error(`${rel(file)}:\n  ${problems.join("\n  ")}`);
  return { defaults, letters };
}

/**
 * What each strategy would send to Azure for one letter: { text } or { ssml } (inner SSML), or
 * nothing when the strategy doesn't apply (c for a vowel letter, e without an IPA).
 */
export function letterCandidates(e) {
  const t = e.texts ?? {};
  const out = { a: { text: e.glyph } };
  const b = t.b ?? (e.kind === "consonant" ? `${e.glyph}অ` : e.kind === "vowel" ? e.glyph : undefined);
  if (b) out.b = { text: b };
  const c = t.c ?? (e.kind === "consonant" ? `${e.glyph}ো` : undefined);
  if (c) out.c = { text: c };
  out.d = { text: e.say ?? e.name ?? e.traditional?.bn ?? b ?? e.glyph };
  if (e.ipa) out.e = { ssml: `<phoneme alphabet="ipa" ph="${xmlEscape(e.ipa)}">${xmlEscape(e.glyph)}</phoneme>` };
  return out;
}

export const letterStrategy = (e, defaults) => e.strategy ?? defaults[e.kind] ?? "b";

/** Speech for a letter clip: its strategy first, then d, b, a as fallbacks (deduplicated). */
export function letterSpeech(e, defaults) {
  const cand = letterCandidates(e);
  const seen = new Set();
  const out = [];
  for (const k of [letterStrategy(e, defaults), "d", "b", "a"]) {
    const item = cand[k];
    const id = item && JSON.stringify(item);
    if (item && !seen.has(id)) { seen.add(id); out.push(item); }
  }
  return out;
}

const LETTERS = loadLetterNames();
/** Clip file for a manifest key. Letter clips also hash what is spoken, so a new strategy makes a new clip. */
const clipFile = (key) => {
  const e = key.startsWith(LETTER_PREFIX) && LETTERS.letters.get(key.slice(LETTER_PREFIX.length));
  return `${sha1(e ? `${key}\n${JSON.stringify(letterSpeech(e, LETTERS.defaults)[0])}` : key)}.mp3`;
};
/** What to synthesize for a key, in order of preference. */
const speechFor = (key) => {
  const e = key.startsWith(LETTER_PREFIX) && LETTERS.letters.get(key.slice(LETTER_PREFIX.length));
  if (e) return letterSpeech(e, LETTERS.defaults);
  return (SPEAK_AS[key] ?? [key]).map((text) => ({ text }));
};
const speechChars = (key) => [...(speechFor(key)[0].text ?? key)].length;

function collect() {
  const ctx = loadAll();
  const set = new Set();
  const add = (s) => {
    if (typeof s !== "string") return;
    const k = audioKey(s);
    if (k && BENGALI.test(k)) set.add(k);
  };
  const addText = (t) => t && add(t.bn);

  for (const s of APP_STRINGS) add(s);
  for (const e of ctx.lexicon.values()) add(e.bn);
  // assumed-known entries (content/assumed/*.json) are shown and spoken in lessons that assume them
  for (const set of ctx.assumed.values()) for (const e of set.entries) add(e.bn);
  for (const plan of ctx.plans.values()) {
    for (const l of plan.lessons ?? []) {
      for (const s of l.sentences ?? []) addText(s);
      for (const ln of l.dialogue?.lines ?? []) addText(ln); // intermediate plans: the reading dialogue
      for (const q of l.dialogue?.questions ?? []) { addText(q.questionBn); for (const o of q.options ?? []) add(o); }
    }
  }
  // Formality trainer (content/formality/scenarios.json): only the correct options (indexes in `answer`), and prompts
  // with ___ filled by each correct answer (like fill_blank's complete `sentence` in lessons). Wrong options get no
  // audio: a confident native voice saying a wrong sentence would reinforce the error.
  const formalityFile = path.join(ROOT, "formality", "scenarios.json");
  if (fs.existsSync(formalityFile)) {
    for (const sc of readJson(formalityFile).scenarios ?? []) {
      for (const i of sc.answer ?? []) addText(sc.options?.[i]);
      const bn = sc.prompt?.bn;
      if (typeof bn !== "string") continue;
      if (!bn.includes("___")) { add(bn); continue; }
      for (const i of sc.answer ?? []) {
        const a = sc.options?.[i]?.bn;
        if (a) add(bn.replace("___", a));
      }
    }
  }
  // Graded stories (content/stories/*.json): every line's Bengali only. Titles, questions and options are not voiced
  // (wrong options would be a confident voice saying a wrong answer).
  const storyDir = path.join(ROOT, "stories");
  for (const f of fs.existsSync(storyDir) ? fs.readdirSync(storyDir).filter((x) => x.endsWith(".json")).sort() : []) {
    let story;
    try { story = readJson(path.join(storyDir, f)); } catch { console.warn(`skip stories/${f}: invalid JSON`); continue; }
    for (const l of Array.isArray(story?.lines) ? story.lines : []) addText(l);
  }
  // My family (content/family/kin.json): kin terms, and the phrases /family composes from them (default and listed
  // address terms and pronouns, plus the bare phrase used when someone is called by name). See validate-family.mjs.
  if (fs.existsSync(FAMILY_FILE)) {
    try { for (const s of familyAudioStrings(readJson(FAMILY_FILE))) add(s); } catch { console.warn("skip family/kin.json: invalid JSON"); }
  }
  // Letter names: one "letter:<glyph>" key per letter and sign of the table.
  for (const glyph of LETTERS.letters.keys()) set.add(`${LETTER_PREFIX}${glyph}`);
  let lessons = 0;
  for (const u of ctx.course.units) {
    for (const id of u.lessons) {
      const file = lessonPath(u, id);
      if (!fs.existsSync(file)) continue;
      let lesson;
      try { lesson = readJson(file); } catch { console.warn(`skip ${rel(file)}: invalid JSON`); continue; }
      lessons++;
      for (const v of lesson.vocab ?? []) addText(v);
      for (const ex of lesson.exercises ?? []) {
        addText(ex.prompt);
        addText(ex.audio);
        addText(ex.sentence); // fill_blank: the complete sentence
        addText(ex.questionBn);
        for (const l of ex.lines ?? []) addText(l); // reading: every line
        for (const p of ex.pairs ?? []) addText(p);
        for (const o of ex.options ?? []) add(o);
        for (const t of ex.tiles ?? []) add(t);
        for (const a of ex.answer && Array.isArray(ex.answer) ? ex.answer : []) add(a);
        for (const a of ex.accepted ?? []) add(a);
        add(ex.glyph);
      }
    }
  }
  return { strings: [...set].sort(), lessons };
}

const xmlEscape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `say` is a string, { text } or { ssml } (inner SSML, already escaped). */
async function synthesize(say, { key, region }) {
  const inner = typeof say === "string" ? xmlEscape(say) : say.ssml ?? xmlEscape(say.text);
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${VOICE_LANG}">` +
    `<voice xml:lang="${VOICE_LANG}" name="${VOICE}">${inner}</voice></speak>`;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": FORMAT,
          "User-Agent": "bangla-lingo-gen-audio",
        },
        body: ssml,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (attempt >= MAX_TRIES) throw err;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error("empty audio response");
      return buf;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_TRIES) {
      const body = await res.text().catch(() => "");
      const hint = res.status === 401 ? " (check AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)" : "";
      throw new Error(`HTTP ${res.status}${hint} ${body.slice(0, 200)}`.trim());
    }
    const ra = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
  }
}
const backoff = (n) => Math.min(30_000, 1000 * 2 ** (n - 1)) + Math.floor(Math.random() * 500);

function readManifest() {
  try {
    const m = readJson(MANIFEST);
    return { voice: m.voice ?? null, items: m.items && typeof m.items === "object" ? m.items : {} };
  } catch {
    return { voice: null, items: {} };
  }
}

function writeManifest(voice, items) {
  const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJson(MANIFEST, { voice: Object.keys(sorted).length ? voice : null, items: sorted });
}

async function main() {
  if (AUDITION) return audition();
  const { strings, lessons } = collect();
  const chars = strings.reduce((n, s) => n + speechChars(s), 0);
  const prev = readManifest();
  const sameVoice = prev.voice === VOICE;
  const exists = (s) => sameVoice && fs.existsSync(path.join(AUDIO_DIR, clipFile(s)));
  const todo = strings.filter((s) => !exists(s));
  const todoChars = todo.reduce((n, s) => n + speechChars(s), 0);
  const letterKeys = strings.filter((s) => s.startsWith(LETTER_PREFIX));

  console.log(`Voice: ${VOICE}`);
  console.log(`Lessons scanned: ${lessons}`);
  console.log(`Bengali strings: ${strings.length} (${chars} characters)`);
  console.log(`To synthesize: ${todo.length} (${todoChars} characters)${sameVoice ? "" : prev.voice ? ` [voice changed from ${prev.voice}]` : ""}`);
  console.log(`Letter-name keys: ${letterKeys.length} (${letterKeys.filter((s) => todo.includes(s)).length} missing)`);
  if (DRY) {
    // Letter keys are listed compactly; other missing strings one per line (up to 20).
    const missingLetters = todo.filter((s) => s.startsWith(LETTER_PREFIX));
    const other = todo.filter((s) => !s.startsWith(LETTER_PREFIX));
    if (missingLetters.length) {
      console.log(`  missing letter keys: ${missingLetters.map((s) => s.slice(LETTER_PREFIX.length)).join(" ")}`);
    }
    if (other.length && other.length <= 20) for (const s of other) console.log(`  missing: ${s}`);
    else if (other.length) console.log(`  missing (other): ${other.length}`);
    // Clips in the manifest that this run would delete as stale.
    const keep = new Set(strings);
    const stale = Object.keys(prev.items).filter((k) => !keep.has(k));
    console.log(`Stale (would be removed): ${stale.length}${stale.length && stale.length <= 20 ? ` (${stale.join(" | ")})` : ""}`);
    return;
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    console.error(
      "Missing AZURE_SPEECH_KEY and/or AZURE_SPEECH_REGION.\n" +
        "Set them to the key and region of an Azure Speech resource, e.g.\n" +
        "  AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus npm run gen:audio\n" +
        "  (or put both lines in a .env file at the repo root — see docs/AUDIO.md)\n" +
        "Use --dry to count strings without calling the API.",
    );
    process.exit(1);
  }

  if (TEST) {
    // Synthesize one word to check the key/region/voice, without touching the repo.
    const sample = "আসসালামু আলাইকুম, ধন্যবাদ।";
    const out = path.join((await import("node:os")).tmpdir(), "bangla-lingo-audio-test.mp3");
    fs.writeFileSync(out, await synthesize(sample, { key, region }));
    console.log(`✓ Azure works. Test clip: ${out}\n  Listen: open "${out}"   (macOS)\n  Then run the full job: npm run gen:audio`);
    return;
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const items = {};
  for (const s of strings) if (exists(s)) items[s] = clipFile(s);

  let done = 0;
  const failures = [];
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const text = queue.shift();
      const file = clipFile(text);
      try {
        let buf;
        const tries = speechFor(text);
        for (const say of tries) {
          try { buf = await synthesize(say, { key, region }); break; }
          catch (e) { if (say === tries.at(-1)) throw e; }
        }
        const out = path.join(AUDIO_DIR, file);
        fs.writeFileSync(`${out}.tmp`, buf);
        fs.renameSync(`${out}.tmp`, out);
        items[text] = file;
      } catch (err) {
        failures.push({ text, err: err.message });
        if (/HTTP 40[13]/.test(err.message)) queue.length = 0; // auth problem: stop early
      }
      done++;
      if (done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Remove clips that are no longer referenced.
  const keep = new Set(Object.values(items));
  let removed = 0;
  for (const f of fs.readdirSync(AUDIO_DIR)) {
    if (f.endsWith(".mp3") && !keep.has(f)) {
      fs.unlinkSync(path.join(AUDIO_DIR, f));
      removed++;
    }
  }

  writeManifest(VOICE, items);
  console.log(`Manifest: ${rel(MANIFEST)} (${Object.keys(items).length} clips, ${removed} stale removed)`);
  if (failures.length) {
    console.error(`${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f.text}: ${f.err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Audition: candidate renderings of a few letter names, to pick a strategy by ear.

const htmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LABELS = {
  a: "(a) bare glyph, today's behaviour",
  b: "(b) vowel spelled out",
  c: "(c) with ো (kō-style)",
  d: "(d) full spoken name",
  e: "(e) SSML IPA phoneme (experimental)",
};

async function audition() {
  const extra = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(audioKey).filter(Boolean);
  const glyphs = extra.length ? [...new Set([...AUDITION_LETTERS, ...extra])] : AUDITION_LETTERS;
  const rows = [];
  for (const g of glyphs) {
    const e = LETTERS.letters.get(g);
    if (!e) { console.warn(`skip ${g}: not in ${rel(LETTER_NAMES)}`); continue; }
    const cand = letterCandidates(e);
    const seen = new Map();
    const list = [];
    for (const k of STRATEGIES) {
      const item = cand[k];
      if (!item) continue;
      const id = JSON.stringify(item);
      list.push({ k, item, same: seen.get(id) });
      if (!seen.has(id)) seen.set(id, k);
    }
    rows.push({ e, list, current: letterStrategy(e, LETTERS.defaults) });
  }
  console.log(`Voice: ${VOICE}`);
  for (const { e, list, current } of rows) {
    console.log(`${e.glyph}  ${e.tr}  (now: ${current})`);
    for (const { k, item, same } of list) console.log(`  ${k}: ${item.text ?? item.ssml}${same ? `  [same as ${same}]` : ""}`);
  }
  if (DRY) return;

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    console.error("Missing AZURE_SPEECH_KEY and/or AZURE_SPEECH_REGION (see docs/AUDIO.md). Add --dry to only list the candidates.");
    process.exit(1);
  }
  fs.rmSync(AUDITION_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUDITION_DIR, { recursive: true });
  let n = 0;
  for (const [ri, row] of rows.entries()) {
    for (const c of row.list) {
      if (c.same) continue;
      c.file = `${String(ri + 1).padStart(2, "0")}-${c.k}.mp3`;
      try {
        fs.writeFileSync(path.join(AUDITION_DIR, c.file), await synthesize(c.item, { key, region }));
        n++;
      } catch (err) {
        c.error = err.message;
        c.file = undefined;
        if (/HTTP 40[13]/.test(err.message)) { console.error(err.message); process.exit(1); }
      }
    }
  }
  const files = new Map(rows.flatMap((r) => r.list.filter((c) => c.file).map((c) => [`${r.e.glyph}:${c.k}`, c.file])));
  const body = rows.map(({ e, list, current }) => {
    const items = list.map((c) => {
      const file = c.file ?? (c.same && files.get(`${e.glyph}:${c.same}`));
      const player = file
        ? `<audio controls preload="none" src="${file}"></audio>`
        : `<span class="err">not available${c.error ? `: ${htmlEscape(c.error.slice(0, 160))}` : ""}</span>`;
      return `<li${c.k === current ? ' class="now"' : ""}><b>${LABELS[c.k]}</b>${c.k === current ? " <i>current</i>" : ""}` +
        `<code lang="bn">${htmlEscape(c.item.text ?? c.item.ssml)}</code>${c.same ? ` <small>same text as (${c.same})</small>` : ""}${player}</li>`;
    }).join("\n");
    return `<section><h2><span lang="bn">${htmlEscape(e.glyph)}</span> · ${htmlEscape(e.tr)} <small>/${htmlEscape(e.ipa ?? "")}/ · ${e.kind}</small></h2><ul>${items}</ul></section>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Letter-name audition</title>
<style>body{font:16px/1.4 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222}
h2{margin:1.6rem 0 .4rem}h2 span{font-size:2rem}small{color:#666;font-weight:normal}ul{list-style:none;padding:0}
li{display:grid;gap:.25rem;padding:.6rem;border:1px solid #ddd;border-radius:.5rem;margin:.4rem 0}li.now{border-color:#888;background:#f6f6f6}
code{font-size:1.1rem}audio{width:100%}.err{color:#a00}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}li{border-color:#444}li.now{background:#222}small{color:#aaa}}</style>
<h1>Letter-name audition</h1>
<p>Voice <code>${VOICE}</code>. Each letter below is rendered several ways; listen and note which letter (a–e) sounds right.
To apply a pick for a whole kind, change <code>"defaults"</code> in <code>content/script/letter-names.json</code>
(e.g. <code>"consonant": "c"</code>); for a single letter, set <code>"strategy"</code> on its entry. Then run <code>npm run gen:audio</code>.</p>
${body}
</html>
`;
  fs.writeFileSync(path.join(AUDITION_DIR, "index.html"), html);
  console.log(`\n✓ ${n} clips in ${path.relative(process.cwd(), AUDITION_DIR) || AUDITION_DIR}/  Open: open "${path.join(AUDITION_DIR, "index.html")}"   (macOS)`);
}

// Run only when executed directly, so tests can import the letter-name helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
