#!/usr/bin/env node
// Pre-generate Bengali audio clips with the Azure Speech REST API.
//
//   npm run gen:audio            synthesize missing clips
//   npm run gen:audio -- --dry   only count strings and characters (no API calls)
//
// Env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (required unless --dry),
//      AZURE_VOICE (default "bn-BD-NabanitaNeural").
//
// Writes web/public/audio/<sha1(text)>.mp3 and content/audio/manifest.json:
//   { "voice": "<voice>", "items": { "<NFC text>": "<sha1>.mp3" } }
// Incremental: clips that already exist for the same voice are skipped. If the
// voice changes, every clip is regenerated. Clips no longer referenced are removed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BENGALI, ROOT, lessonPath, loadAll, readJson, rel, writeJson } from "./lib.mjs";

const DRY = process.argv.includes("--dry");
const VOICE = process.env.AZURE_VOICE || "bn-BD-NabanitaNeural";
const VOICE_LANG = VOICE.split("-").slice(0, 2).join("-") || "bn-BD";
const FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const CONCURRENCY = 4;
const MAX_TRIES = 6;

const AUDIO_DIR = path.join(ROOT, "..", "web", "public", "audio");
const MANIFEST = path.join(ROOT, "audio", "manifest.json");

// Bengali strings the app speaks that are not lesson content.
// Keep in sync with the voice sample in web/src/components/SettingsPanel.tsx.
const APP_STRINGS = ["বাংলা"];

/** Same normalisation the app uses before looking a string up. */
export const audioKey = (s) => s.normalize("NFC").trim();
const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");

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
  for (const plan of ctx.plans.values()) {
    for (const l of plan.lessons ?? []) for (const s of l.sentences ?? []) addText(s);
  }
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

async function synthesize(text, { key, region }) {
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${VOICE_LANG}">` +
    `<voice xml:lang="${VOICE_LANG}" name="${VOICE}">${xmlEscape(text)}</voice></speak>`;
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
  const { strings, lessons } = collect();
  const chars = strings.reduce((n, s) => n + [...s].length, 0);
  const prev = readManifest();
  const sameVoice = prev.voice === VOICE;
  const exists = (s) => sameVoice && fs.existsSync(path.join(AUDIO_DIR, `${sha1(s)}.mp3`));
  const todo = strings.filter((s) => !exists(s));
  const todoChars = todo.reduce((n, s) => n + [...s].length, 0);

  console.log(`Voice: ${VOICE}`);
  console.log(`Lessons scanned: ${lessons}`);
  console.log(`Bengali strings: ${strings.length} (${chars} characters)`);
  console.log(`To synthesize: ${todo.length} (${todoChars} characters)${sameVoice ? "" : prev.voice ? ` [voice changed from ${prev.voice}]` : ""}`);
  if (DRY) return;

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    console.error(
      "Missing AZURE_SPEECH_KEY and/or AZURE_SPEECH_REGION.\n" +
        "Set them to the key and region of an Azure Speech resource, e.g.\n" +
        "  AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus npm run gen:audio\n" +
        "Use --dry to count strings without calling the API.",
    );
    process.exit(1);
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const items = {};
  for (const s of strings) if (exists(s)) items[s] = `${sha1(s)}.mp3`;

  let done = 0;
  const failures = [];
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const text = queue.shift();
      const file = `${sha1(text)}.mp3`;
      try {
        const buf = await synthesize(text, { key, region });
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
