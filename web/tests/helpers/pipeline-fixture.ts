// Tiny throw-away content dirs for the pipeline tests: one beginner unit plus one intermediate unit
// that assumes a "bridge" list. Test words only; nothing here is course content.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const T = (bn: string, tr: string, en: string) => ({ bn, tr, en });

export const SCRIPTS = path.resolve(import.meta.dirname, "..", "..", "..", "content", "scripts");

const made: string[] = [];
export function cleanup() {
  made.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}

export const BEGINNER_WORDS = [
  { id: "ami", ...T("আমি", "ami", "I"), pos: "pronoun" },
  { id: "tumi", ...T("তুমি", "tumi", "you"), pos: "pronoun" },
  { id: "bhalo", ...T("ভালো", "bhalo", "good"), pos: "adj" },
  { id: "achhi", ...T("আছি", "achhi", "am"), pos: "verb" },
];
export const ASSUMED_WORDS = [
  { id: "bari", ...T("বাড়ি", "bari", "home"), pos: "noun" },
  { id: "amar", ...T("আমার", "amar", "my"), pos: "pronoun" },
  { id: "ekhon", ...T("এখন", "ekhon", "now"), pos: "adv" },
  { id: "achhe", ...T("আছে", "achhe", "is, has"), pos: "verb" },
  { id: "shokal", ...T("সকাল", "shokal", "morning"), pos: "noun" },
  { id: "jai", ...T("যাই", "jai", "I go"), pos: "verb" },
];
export const INT_WORDS = [
  { id: "bondhu", ...T("বন্ধু", "bondhu", "friend"), pos: "noun" },
  { id: "kaj", ...T("কাজ", "kaj", "work"), pos: "noun" },
  { id: "onek", ...T("অনেক", "onek", "very"), pos: "adv" },
  { id: "khushi", ...T("খুশি", "khushi", "happy"), pos: "adj" },
  { id: "kothay", ...T("কোথায়", "kothay", "where"), pos: "adv" },
  { id: "tarpor", ...T("তারপর", "tarpor", "then"), pos: "adv" },
  { id: "rafi", ...T("রাফি", "rafi", "Rafi"), pos: "name" },
];
export const INT_SENTENCES = [
  { ...T("আমি অনেক খুশি।", "ami onek khushi", "I am very happy.") },
  { ...T("তুমি কোথায়?", "tumi kothay?", "Where are you?") },
  { ...T("আমি বাড়ি আছি।", "ami bari achhi", "I am at home.") },
  { ...T("এখন আমার কাজ আছে।", "ekhon amar kaj achhe", "I have work now.") },
  { ...T("তারপর বন্ধু খুশি।", "tarpor bondhu khushi", "Then the friend is happy.") },
  { ...T("রাফি কোথায়?", "rafi kothay?", "Where is Rafi?") },
  { ...T("আমার বন্ধু ভালো আছে।", "amar bondhu bhalo achhe", "My friend is well.") },
];
export const DIALOGUE = {
  title: "On the phone",
  lines: [
    { speaker: "Rafi", ...T("তুমি কোথায়?", "tumi kothay?", "Where are you?") },
    { speaker: "Mina", ...T("আমি বাড়ি আছি।", "ami bari achhi", "I am at home.") },
    { speaker: "Rafi", ...T("এখন আমার কাজ আছে।", "ekhon amar kaj achhe", "I have work now.") },
    { speaker: "Mina", ...T("তারপর বন্ধু খুশি।", "tarpor bondhu khushi", "Then the friend is happy.") },
  ],
  questions: [
    { question: "Where is Mina?", options: ["At home", "At work", "Nowhere"], answer: 0 },
    { question: "Who has work?", options: ["Mina", "Rafi", "Nobody"], answer: 1 },
  ],
};

const recog = (id: string, w: { bn: string; tr: string; en: string }) => ({
  id, type: "select_translation", direction: "bn_to_en", prompt: T(w.bn, w.tr, w.en), options: [w.en, "no", "yes"], answer: 0,
});

/** Files of the fixture, path (relative to the content dir) -> JSON. Pass `edit` to change them before they are written. */
export function fixtureFiles(): Record<string, Json> {
  return structuredClone({
    "course.json": {
      id: "t", title: "T",
      sections: [{ id: 1, title: "Foundations" }, { id: 2, title: "Going further" }],
      units: [
        { id: "u01-t", title: "Basics", track: "main", lessons: ["u01-l01"] },
        { id: "i01-t", title: "Catching up", track: "main", level: "intermediate", section: 2, assumes: ["bridge"], scriptOnly: true, lessons: [] },
      ],
    },
    "lexicon/u01-t.json": { unit: "u01-t", entries: BEGINNER_WORDS.map((e) => ({ ...e, lesson: "u01-l01" })) },
    "lexicon/i01-t.json": { unit: "i01-t", entries: INT_WORDS.map((e) => ({ ...e, lesson: "i01-l01" })) },
    "assumed/bridge.json": { name: "bridge", entries: ASSUMED_WORDS },
    "plans/u01-t.json": { unit: "u01-t", lessons: [{ id: "u01-l01", title: "T", new: BEGINNER_WORDS.map((e) => e.id), review: [], sentences: [] },
      { id: "u01-l02", title: "Later", new: [], review: [], sentences: [] }, // not authored: the unit is incomplete, so no review-lesson rule yet
    ] },
    "plans/i01-t.json": {
      unit: "i01-t",
      lessons: [{
        id: "i01-l01", title: "Where are you?", goal: "Ask and say where you are.",
        new: INT_WORDS.map((e) => e.id), review: ["ami", "tumi", "bhalo", "bari"],
        tip: "A **tip**.", sentences: INT_SENTENCES, dialogue: DIALOGUE,
      }, { id: "i01-l02", title: "Later", new: [], review: [], sentences: [] }],
    },
    "units/u01-t/u01-l01.json": {
      id: "u01-l01", unit: "u01-t", title: "T", status: "draft",
      vocab: BEGINNER_WORDS.map(({ id, bn, tr, en }) => ({ id, bn, tr, en })),
      exercises: BEGINNER_WORDS.map((w, i) => recog(`e${i + 1}`, w)),
    },
  });
}

/** Write the fixture to a fresh temp dir (CONTENT_DIR layout) and return it. */
export function makeContent(edit?: (files: Record<string, Json | null>) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-pipeline-"));
  made.push(dir);
  const files: Record<string, Json | null> = fixtureFiles();
  edit?.(files);
  for (const [f, data] of Object.entries(files)) {
    if (data === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(data, null, 2) + "\n");
  }
  return dir;
}

export const readJson = (dir: string, f: string): Json => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
export const writeJson = (dir: string, f: string, d: unknown) => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), JSON.stringify(d, null, 2) + "\n");
};

/** Run content/scripts/<script> with CONTENT_DIR pointing at `dir`. */
export function runScript(script: string, dir: string, args: string[] = []) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    env: { ...process.env, CONTENT_DIR: dir }, encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}\n${r.stderr}` };
}
export const validate = (dir: string, ...args: string[]) => runScript("validate.mjs", dir, ["--quiet", ...args]);
/** `gen-lesson <id>` for real (registers in course.json); the lesson file lands in `dir`. */
export const generate = (dir: string, id: string, ...args: string[]) => runScript("gen-lesson.mjs", dir, [id, ...args]);
