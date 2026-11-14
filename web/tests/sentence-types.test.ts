import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkResponse, solutionFor } from "@/lib/answers";
import { blankPositions, maskedTranslit, splitAtBlank, TR_GAP } from "@/lib/fillBlank";
import { resolveIndex, targetsFor, testedStrings, gradesFor, type WordIndex } from "@/lib/review/targets";
import type {
  Exercise,
  FillBlankExercise,
  Lesson,
  ListenMeaningExercise,
  ReadingExercise,
} from "@/lib/types";

const bn = (b: string, tr = "x", en = "y") => ({ bn: b, tr, en });
const SENT = bn("আমি ভালো আছি।", "ami bhalo achhi", "I am fine.");

const fillChoice: FillBlankExercise = {
  id: "f1",
  type: "fill_blank",
  sentence: SENT,
  blank: "ভালো",
  options: ["ভালো", "খারাপ", "বড়"],
  answer: 0,
};
const fillTyped: FillBlankExercise = {
  id: "f2",
  type: "fill_blank",
  sentence: SENT,
  blank: "ভালো",
  accepted: ["bhalo", "bhaalo", "ভালো"],
};
const listenMeaning: ListenMeaningExercise = {
  id: "l1",
  type: "listen_meaning",
  audio: SENT,
  options: ["I am fine.", "Thank you.", "Are you well?"],
  answer: 0,
};
const reading: ReadingExercise = {
  id: "r1",
  type: "reading",
  lines: [bn("তুমি ভালো আছ?", "tumi bhalo achho?", "Are you well?"), bn("হ্যাঁ, আমি ভালো আছি।", "hya, ami bhalo achhi", "Yes, I am fine.")],
  question: "How is the second speaker?",
  options: ["Fine", "Tired", "Hungry"],
  answer: 0,
};

describe("fill_blank checking", () => {
  it("choice: only the answer index is right", () => {
    expect(checkResponse(fillChoice, { kind: "index", value: 0 })).toBe(true);
    expect(checkResponse(fillChoice, { kind: "index", value: 1 })).toBe(false);
    expect(checkResponse(fillChoice, { kind: "text", value: "ভালো" })).toBe(false);
  });
  it("typed: accepts Bengali and transliteration variants, ignoring case, punctuation and spaces", () => {
    for (const v of ["ভালো", "bhalo", "  Bhalo ", "bhaalo.", "ভালো।"])
      expect(checkResponse(fillTyped, { kind: "text", value: v })).toBe(true);
    expect(checkResponse(fillTyped, { kind: "text", value: "kharap" })).toBe(false);
    expect(checkResponse(fillTyped, { kind: "index", value: 0 })).toBe(false);
  });
  it("typed: the blank itself is accepted even if `accepted` forgets it", () => {
    const ex: FillBlankExercise = { ...fillTyped, accepted: ["bhalo"] };
    expect(checkResponse(ex, { kind: "text", value: "ভালো" })).toBe(true);
  });
  it("typed: Bengali NFD and NFC input are the same answer", () => {
    // ো (U+09CB) is the composed form of ে + া (U+09C7 U+09BE); য় / ড় decompose even under NFC.
    const composed = "ভা\u09B2\u09CB"; // ভালো
    const decomposed = "ভা\u09B2\u09C7\u09BE";
    expect(decomposed).not.toBe(composed);
    const ex: FillBlankExercise = { ...fillTyped, accepted: [composed, "bhalo"] };
    expect(checkResponse(ex, { kind: "text", value: decomposed })).toBe(true);
    expect(checkResponse({ ...ex, accepted: [decomposed] }, { kind: "text", value: composed })).toBe(true);
    // a decomposed sentence/blank still splits correctly
    expect(splitAtBlank("আমি " + decomposed + " আছি।", composed)).toEqual({ before: "আমি ", after: " আছি।" });
    const yo = "দয়া".normalize("NFC"); // য় is stored as য + ় after NFC
    expect(checkResponse({ ...fillTyped, blank: yo, accepted: [yo] }, { kind: "text", value: "দ\u09DF\u09BE" })).toBe(true);
  });
  it("shows the missing word, with the full sentence, as the solution", () => {
    expect(solutionFor(fillChoice)).toEqual({ text: SENT, display: "ভালো" });
    expect(solutionFor(fillTyped)).toEqual({ text: SENT, display: "ভালো" });
  });
});

describe("listen_meaning and reading checking", () => {
  it("grade by answer index", () => {
    expect(checkResponse(listenMeaning, { kind: "index", value: 0 })).toBe(true);
    expect(checkResponse(listenMeaning, { kind: "index", value: 2 })).toBe(false);
    expect(checkResponse(reading, { kind: "index", value: 0 })).toBe(true);
    expect(checkResponse(reading, { kind: "index", value: 1 })).toBe(false);
    expect(checkResponse(reading, { kind: "text", value: "Fine" })).toBe(false);
  });
  it("solutions: the sentence for listening, just the answer text for reading", () => {
    expect(solutionFor(listenMeaning)).toEqual({ text: SENT, display: "I am fine." });
    expect(solutionFor(reading)).toEqual({ answer: "Fine" });
  });
});

describe("fill_blank sentence helpers", () => {
  it("finds the blank only as a whole word", () => {
    expect(blankPositions("আমি ভালো আছি।", "ভালো")).toEqual([4]);
    expect(blankPositions("আমি ভালোবাসি।", "ভালো")).toEqual([]);
    expect(blankPositions("ভালো, ভালো।", "ভালো")).toHaveLength(2);
  });
  it("matches multi-word blanks and NFD input", () => {
    expect(splitAtBlank("আপনি কেমন আছেন?", "কেমন আছেন")).toEqual({ before: "আপনি ", after: "?" });
    expect(splitAtBlank("সে বড় নয়।".normalize("NFD"), "বড়")).toEqual({ before: "সে ", after: " নয়।" });
  });
  it("splitAtBlank is null unless the blank occurs exactly once", () => {
    expect(splitAtBlank("ভালো ভালো।", "ভালো")).toBeNull();
    expect(splitAtBlank("আমি আছি।", "ভালো")).toBeNull();
  });
  it("masks the blank's transliteration, keeping punctuation", () => {
    expect(maskedTranslit(SENT, "ভালো")).toBe(`ami ${TR_GAP} achhi`);
    expect(maskedTranslit(bn("না, ধন্যবাদ।", "na, dhonnobad"), "ধন্যবাদ")).toBe(`na, ${TR_GAP}`);
    expect(maskedTranslit(bn("কী খবর?", "ki khobor?"), "কী খবর")).toBe(`${TR_GAP}?`);
  });
  it("never leaks the blank: the masked string does not contain its transliteration", () => {
    const m = maskedTranslit(SENT, "ভালো")!;
    expect(m).not.toContain("bhalo");
  });
  it("hides the transliteration (null) when words do not line up one to one", () => {
    expect(maskedTranslit(bn("আমি ভালো আছি।", "ami bhaloachhi"), "ভালো")).toBeNull();
    expect(maskedTranslit(bn("ভালো ভালো।", "bhalo bhalo"), "ভালো")).toBeNull();
  });
});

describe("review targets for the sentence-level types", () => {
  const index: WordIndex = {
    entries: [
      ["ami", "আমি"],
      ["bhalo", "ভালো"],
      ["achhi", "আছি"],
      ["tumi", "তুমি"],
      ["hya", "হ্যাঁ"],
    ],
    lessons: { "u05-l01": ["bhalo"] },
  };
  const idx = resolveIndex(index);

  it("fill_blank tests only the blank, not the rest of the sentence", () => {
    expect(testedStrings(fillChoice)).toEqual(["ভালো"]);
    expect(targetsFor(idx, "u05-l01", fillChoice)).toEqual([{ id: "bhalo", own: true }]);
    expect(targetsFor(idx, "u09-l01", fillTyped)).toEqual([{ id: "bhalo", own: false }]);
  });
  it("a wrong fill_blank blames its one word", () => {
    expect(gradesFor(targetsFor(idx, "u05-l01", fillChoice), false)).toEqual([{ id: "bhalo", grade: "again" }]);
  });
  it("listen_meaning tests the words of the heard sentence", () => {
    expect(targetsFor(idx, "u05-l01", listenMeaning).map((t) => t.id)).toEqual(["ami", "bhalo", "achhi"]);
  });
  it("reading tests the words of every line, once each, but not the question", () => {
    const ex: ReadingExercise = { ...reading, questionBn: bn("হ্যাঁ?") };
    expect(testedStrings(ex)).toEqual(["তুমি ভালো আছ?", "হ্যাঁ, আমি ভালো আছি।"]);
    expect(targetsFor(idx, "u05-l01", ex).map((t) => t.id)).toEqual(["tumi", "bhalo", "hya", "ami", "achhi"]);
  });
  it("survives malformed input without throwing", () => {
    expect(testedStrings({ id: "x", type: "reading" } as unknown as Exercise)).toEqual([]);
    expect(testedStrings({ id: "x", type: "fill_blank" } as unknown as Exercise)).toEqual([]);
  });
});

describe("demo fixture lesson", () => {
  const lesson = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, "..", "src", "fixtures", "units", "demo-basics", "demo-l01.json"), "utf8"),
  ) as Lesson;

  it("has one of each new type, and each authored answer checks out", () => {
    const by = (t: string) => lesson.exercises.filter((e) => e.type === t);
    expect(by("fill_blank").length).toBe(2); // one chosen, one typed
    expect(by("listen_meaning").length).toBe(1);
    expect(by("reading").length).toBe(1);
    for (const e of lesson.exercises) {
      if (e.type === "fill_blank") {
        expect(splitAtBlank(e.sentence.bn, e.blank)).not.toBeNull();
        expect(checkResponse(e, e.options ? { kind: "index", value: e.answer! } : { kind: "text", value: e.accepted![0] })).toBe(true);
        if (e.options) expect(e.options[e.answer!]).toBe(e.blank);
      }
      if (e.type === "listen_meaning" || e.type === "reading") expect(checkResponse(e, { kind: "index", value: e.answer })).toBe(true);
    }
  });
});
