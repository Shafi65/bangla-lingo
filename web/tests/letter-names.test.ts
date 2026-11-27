import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCourse, getLesson } from "../src/lib/content";
import { buildLetterNames } from "../src/lib/letterNames";
import { buildWriteGroups, flattenLetters } from "../src/lib/write/letters";
import * as genAudio from "../../content/scripts/gen-audio.mjs";

// Plain ESM script: loosely typed here.
type Entry = Record<string, unknown>;
type Speech = { text?: string; ssml?: string };
const { letterCandidates, letterSpeech, loadLetterNames, LETTER_PREFIX } = genAudio as unknown as {
  letterCandidates: (e: Entry) => Record<string, Speech>;
  letterSpeech: (e: Entry, d: Record<string, string>) => Speech[];
  loadLetterNames: (file: string) => { defaults: Record<string, string>; letters: Map<string, Entry> };
  LETTER_PREFIX: string;
};
const get = (m: Map<string, Entry>, g: string): Entry => m.get(g)!;

const FILE = path.join(process.cwd(), "..", "content", "script", "letter-names.json");
const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));

describe("letter names table", () => {
  it("passes gen-audio's checks and covers every letter and sign on /write", () => {
    const { letters } = loadLetterNames(FILE);
    const units = getCourse().units.filter((u) => u.track === "script");
    const groups = buildWriteGroups(
      units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons.map((l) => l.id) })),
      getLesson,
    );
    const missing = flattenLetters(groups).map((l) => l.glyph).filter((g) => !letters.has(g));
    expect(missing).toEqual([]);
    for (const g of ["া", "ি", "ী", "ু", "ূ", "ৃ", "ে", "ৈ", "ো", "ৌ", "ং", "ঃ", "ঁ", "ৎ", "্"]) expect(letters.has(g)).toBe(true);
  });

  it("speaks plain consonants with the vowel spelled out and named letters by their name", () => {
    const { defaults, letters } = loadLetterNames(FILE);
    expect(letterSpeech(get(letters, "ক"), defaults)[0]).toEqual({ text: "কঅ" });
    expect(letterSpeech(get(letters, "ঙ"), defaults)[0]).toEqual({ text: "উঙ" });
    expect(letterSpeech(get(letters, "শ"), defaults)[0]).toEqual({ text: "তালব্য শ" });
    expect(letterSpeech(get(letters, "ি"), defaults)[0]).toEqual({ text: "ই-কার" });
    expect(letterSpeech(get(letters, "ং"), defaults)[0]).toEqual({ text: "অনুস্বার" });
    expect(letterSpeech(get(letters, "অ"), defaults)[0]).toEqual({ text: "অ" });
    // a per-letter strategy wins over the default
    expect(letterSpeech({ ...get(letters, "ক"), strategy: "c" }, defaults)[0]).toEqual({ text: "কো" });
    expect(letterCandidates(get(letters, "থ")).e.ssml).toBe('<phoneme alphabet="ipa" ph="t̪ʰɔ">থ</phoneme>');
    expect(LETTER_PREFIX).toBe("letter:");
  });

  it("builds the app's compact map", () => {
    const m = buildLetterNames(doc);
    expect(m["ক"]).toEqual({ glyph: "ক", label: "ক", tr: "ko", say: "কঅ" });
    expect(m["শ"]).toMatchObject({ label: "তালব্য শ", tr: "talobbo sho" });
    expect(m["ি"]).toMatchObject({ label: "ই-কার", tr: "i-kar" });
    expect(buildLetterNames(null)).toEqual({});
  });
});

describe("letter playback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(items: Record<string, string>) {
    vi.stubEnv("BL_AUDIO_MANIFEST", JSON.stringify({ voice: "v", items }));
    vi.stubEnv("BL_LETTER_NAMES", JSON.stringify(buildLetterNames(doc)));
    vi.resetModules();
    return import("../src/lib/speech");
  }

  it("uses the letter clip only in letter mode", async () => {
    const { resolveSpeech, hasRecording } = await load({ "letter:ক": "lk.mp3", ক: "k.mp3", ও: "o.mp3" });
    expect(resolveSpeech("ক", true)).toEqual({ file: "lk.mp3", text: "কঅ" });
    expect(resolveSpeech("ক")).toEqual({ file: "k.mp3", text: "ক" });
    // no letter clip yet: the plain clip, and the name for a device voice
    expect(resolveSpeech("ও", true)).toEqual({ file: "o.mp3", text: "ও" });
    expect(resolveSpeech("শ", true)).toEqual({ file: undefined, text: "তালব্য শ" });
    // words are never letters
    expect(resolveSpeech("কা", true)).toEqual({ file: undefined, text: "কা" });
    expect(hasRecording("ক", { letter: true })).toBe(true);
  });
});
