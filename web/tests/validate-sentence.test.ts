import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Runs content/scripts/validate.mjs against tiny throw-away content dirs (CONTENT_DIR override).

const SCRIPT = path.resolve(import.meta.dirname, "..", "..", "content", "scripts", "validate.mjs");
const made: string[] = [];
afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

type Json = Record<string, unknown>;
const T = (bn: string, tr: string, en: string) => ({ bn, tr, en });
const WORDS = [
  { id: "ami", ...T("আমি", "ami", "I"), pos: "pronoun" },
  { id: "bhalo", ...T("ভালো", "bhalo", "good"), pos: "adj" },
  { id: "achhi", ...T("আছি", "achhi", "am"), pos: "verb" },
];
const SENT = T("আমি ভালো আছি।", "ami bhalo achhi", "I am fine.");
const recog = (id: string, w: (typeof WORDS)[number]) => ({
  id, type: "select_translation", direction: "bn_to_en", prompt: T(w.bn, w.tr, w.en),
  options: [w.en, "no", "yes"], answer: 0,
});
const RECOGNITION = WORDS.map((w, i) => recog(`r${i}`, w));

function build(exercises: Json[], base: Json[] = RECOGNITION): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-validate-"));
  made.push(dir);
  const w = (f: string, d: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(d));
  };
  w("course.json", { id: "t", title: "T", units: [{ id: "u01-t", title: "T", track: "main", lessons: ["u01-l01"] }] });
  w("lexicon/u01-t.json", { unit: "u01-t", entries: WORDS.map((e) => ({ ...e, lesson: "u01-l01" })) });
  w("plans/u01-t.json", { unit: "u01-t", lessons: [
    { id: "u01-l01", title: "T", new: WORDS.map((e) => e.id), review: [], sentences: [] },
    { id: "u01-l02", title: "Later", new: [], review: [], sentences: [] }, // unit not complete: no review-lesson rule
  ] });
  w("units/u01-t/u01-l01.json", {
    id: "u01-l01", unit: "u01-t", title: "T", status: "draft",
    vocab: WORDS.map(({ id, bn, tr, en }) => ({ id, bn, tr, en })),
    exercises: [...base, ...exercises],
  });
  return dir;
}

function run(exercises: Json[], { strict = false, base = RECOGNITION }: { strict?: boolean; base?: Json[] } = {}) {
  const dir = build(exercises, base);
  const r = spawnSync(process.execPath, [SCRIPT, "--quiet", ...(strict ? ["--strict"] : [])], {
    env: { ...process.env, CONTENT_DIR: dir },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const fillChoice = { id: "f1", type: "fill_blank", sentence: SENT, blank: "ভালো", options: ["ভালো", "আমি", "আছি"], answer: 0 };
const fillTyped = { id: "f2", type: "fill_blank", sentence: SENT, blank: "ভালো", accepted: ["ভালো", "bhalo"] };
const listen = { id: "l1", type: "listen_meaning", audio: SENT, options: ["I am fine.", "I am not.", "You are fine."], answer: 0 };
const reading = {
  id: "d1", type: "reading", title: "Hi",
  lines: [
    { speaker: "A", ...T("আমি ভালো?", "ami bhalo?", "Am I fine?") },
    { speaker: "B", ...T("আমি আছি।", "ami achhi", "I am here.") },
  ],
  question: "Who is here?", options: ["B", "A", "Nobody"], answer: 0,
};

describe("validate.mjs: sentence-level types", () => {
  it("accepts a valid example of each type (also with --strict)", () => {
    for (const strict of [false, true]) {
      const paragraph = {
        ...reading, id: "d2", questionBn: T("আমি?", "ami?", "I?"),
        lines: reading.lines.map((l) => T(l.bn, l.tr, l.en)), // no speakers: a paragraph
      };
      const r = run([fillChoice, fillTyped, listen, reading, paragraph], { strict });
      expect(r.out).toMatch(/0 errors/);
      expect(r.code).toBe(0);
    }
  });

  describe("fill_blank", () => {
    it("requires the blank to occur exactly once, as a whole word", () => {
      const twice = { ...fillChoice, sentence: T("ভালো ভালো আছি।", "bhalo bhalo achhi", "Fine, fine.") };
      expect(run([twice]).out).toMatch(/exactly once.*found 2/);
      expect(run([{ ...fillChoice, blank: "খারাপ", options: ["খারাপ", "আমি"] }]).out).toMatch(/exactly once.*found 0/);
      const inside = { ...fillChoice, sentence: T("আমি ভালোবাসি।", "ami bhalobashi", "I love."), blank: "ভালো" };
      expect(run([inside]).out).toMatch(/exactly once.*found 0/);
      expect(run([inside]).code).toBe(1);
    });
    it("takes options + answer or accepted, not both and not neither", () => {
      expect(run([{ ...fillChoice, accepted: ["bhalo"] }]).out).toMatch(/not both/);
      const neither: Json = { ...fillChoice };
      delete neither.options;
      delete neither.answer;
      expect(run([neither]).out).toMatch(/needs options \+ answer/);
    });
    it("checks options: unique, answer in range, Bengali, and the answer is the blank", () => {
      expect(run([{ ...fillChoice, options: ["ভালো", "ভালো", "আছি"] }]).out).toMatch(/duplicate options/);
      expect(run([{ ...fillChoice, answer: 3 }]).out).toMatch(/out of range/);
      expect(run([{ ...fillChoice, options: ["good", "আমি"] }]).out).toMatch(/Bengali script/);
      expect(run([{ ...fillChoice, answer: 1 }]).out).toMatch(/must equal blank/);
    });
    it("requires a complete sentence BnText and non-empty accepted", () => {
      expect(run([{ ...fillChoice, sentence: { bn: SENT.bn, en: SENT.en } }]).out).toMatch(/missing tr/);
      expect(run([{ ...fillTyped, accepted: [] }]).out).toMatch(/accepted must be non-empty/);
    });
  });

  describe("listen_meaning", () => {
    it("needs audio BnText, English options and an in-range answer", () => {
      expect(run([{ ...listen, audio: { bn: SENT.bn, tr: SENT.tr } }]).out).toMatch(/missing en/);
      expect(run([{ ...listen, options: ["I am fine.", "আমি"] }]).out).toMatch(/English meanings/);
      expect(run([{ ...listen, options: ["I am fine.", "I am fine."] }]).out).toMatch(/duplicate options/);
      expect(run([{ ...listen, answer: 7 }]).out).toMatch(/out of range/);
    });
  });

  describe("reading", () => {
    const line = (n: number) => ({ speaker: n % 2 ? "B" : "A", ...T("আমি আছি।", "ami achhi", "I am here.") });
    it("needs 2-8 lines", () => {
      expect(run([{ ...reading, lines: [line(0)] }]).out).toMatch(/2–8 lines/);
      expect(run([{ ...reading, lines: Array.from({ length: 9 }, (_, i) => line(i)) }]).out).toMatch(/2–8 lines/);
      expect(run([{ ...reading, lines: Array.from({ length: 8 }, (_, i) => line(i)) }]).out).toMatch(/0 errors/);
    });
    it("needs complete lines, consistent speakers, an English question and consistent options", () => {
      expect(run([{ ...reading, lines: [line(0), { bn: "আমি।", tr: "ami" }] }]).out).toMatch(/missing en/);
      expect(run([{ ...reading, lines: [line(0), T("আমি।", "ami", "I.")] }]).out).toMatch(/every line a speaker, or none/);
      expect(run([{ ...reading, question: "কে?" }]).out).toMatch(/questionBn/);
      expect(run([{ ...reading, options: ["B", "আমি"] }]).out).toMatch(/all English or all Bengali/);
      expect(run([{ ...reading, questionBn: { bn: "কে?", tr: "ke?" } }]).out).toMatch(/missing en/);
    });
    it("allows all-Bengali options for a Bengali question", () => {
      const r = run([{ ...reading, questionBn: T("আমি?", "ami?", "I?"), options: ["আমি", "আছি"] }]);
      expect(r.out).toMatch(/0 errors/);
    });
  });

  describe("--strict rules reach the new types", () => {
    it("flags a Bengali word that is not taught yet, in a sentence, a line or questionBn", () => {
      const untaught = T("তুমি ভালো আছ।", "tumi bhalo achho", "You are fine.");
      for (const ex of [
        { ...fillChoice, sentence: untaught },
        { ...listen, audio: untaught },
        { ...reading, lines: [{ speaker: "A", ...untaught }, reading.lines[1]] },
        { ...reading, questionBn: T("তুমি?", "tumi?", "You?") },
      ]) {
        const r = run([ex], { strict: true });
        expect(r.out).toMatch(/\[strict:untaught\].*তুমি/);
        expect(r.code).toBe(1);
      }
      expect(run([{ ...listen, audio: untaught }]).code).toBe(0); // only strict mode objects
    });
    it("counts listen_meaning and reading as recognition, a blank new word as production", () => {
      const only = (w: string) => RECOGNITION.filter((e) => (e.prompt as { bn: string }).bn !== w);
      // বhalo's first appearance is in a listening exercise: fine
      expect(run([listen], { strict: true, base: [] }).out).not.toMatch(/production-first/);
      expect(run([reading], { strict: true, base: [] }).out).not.toMatch(/production-first/);
      // typed fill_blank introducing ভালো: production-first
      const typed = run([fillTyped], { strict: true, base: only("ভালো") });
      expect(typed.out).toMatch(/\[strict:production-first\]/);
      // the same exercise after a recognition exercise is fine
      expect(run([fillTyped], { strict: true }).out).not.toMatch(/production-first/);
    });
  });
});

describe("gen-audio --dry and audit", () => {
  const scripts = path.dirname(SCRIPT);
  const node = (script: string, args: string[], dir: string) => {
    const r = spawnSync(process.execPath, [path.join(scripts, script), ...args], {
      env: { ...process.env, CONTENT_DIR: dir, AZURE_SPEECH_KEY: "", AZURE_SPEECH_REGION: "" },
      encoding: "utf8",
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
  };
  const dir = build([
    { id: "f1", type: "fill_blank", sentence: T("আমি ভালো আছি, ধন্যবাদ।", "x", "x"), blank: "ভালো", accepted: ["bhalo"] },
    { ...listen, audio: T("আমি আছি।", "ami achhi", "I am here.") },
    { ...reading, questionBn: T("আমি কে?", "ami ke?", "Who am I?") },
    { ...fillChoice, id: "f9" },
  ]);

  it("collects the fill_blank sentence, the listen_meaning audio and every reading line, without a key", () => {
    const base = node("gen-audio.mjs", ["--dry"], build([]));
    const withNew = node("gen-audio.mjs", ["--dry"], dir);
    expect(withNew.code).toBe(0);
    const n = (o: string) => Number(/Bengali strings: (\d+)/.exec(o)![1]);
    // new strings: আমি ভালো আছি, ধন্যবাদ। · আমি ভালো আছি। · আমি আছি। (also a reading line) · আমি ভালো? · আমি কে?
    expect(n(withNew.out) - n(base.out)).toBe(5);
  });

  it("audit counts them and reports sentence-level listening separately", () => {
    const r = node("audit.mjs", ["--json"], dir);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out.slice(r.out.indexOf("{")));
    expect(j.balance.mix).toMatchObject({ fill_blank: 2, listen_meaning: 1, reading: 1 });
    expect(j.sentenceLevel).toMatchObject({ fillChoice: 1, fillTyped: 1, listenMeaning: 1, reading: 1, listening: 2 });
  });
});
