import { describe, expect, it } from "vitest";
import {
  gradesFor,
  resolveIndex,
  reviewExerciseId,
  reviewWordId,
  targetsFor,
  type WordIndex,
} from "@/lib/review/targets";
import type { Exercise } from "@/lib/types";

const index: WordIndex = {
  entries: [
    ["ami", "আমি"],
    ["bhalo", "ভালো"],
    ["achhi", "আছি"],
    ["tumi", "তুমি"],
    ["na", "না"],
    ["na2", "না"], // homograph of "na", taught in another lesson
    ["dhonnobad", "ধন্যবাদ"],
    ["ki-khobor", "কী খবর"],
    ["l-ka", "ক"],
  ],
  lessons: {
    "u02-l03": ["achhi"],
    "u01-l01": ["dhonnobad", "na"],
    "u09-l01": ["na2"],
  },
};
const idx = resolveIndex(index);
const bn = (b: string) => ({ bn: b, tr: "x", en: "x" });

describe("targetsFor", () => {
  it("maps a single-word prompt to its word", () => {
    const ex = { id: "e1", type: "select_translation", prompt: bn("ধন্যবাদ"), direction: "bn_to_en", options: ["a", "b"], answer: 0 } as Exercise;
    expect(targetsFor(idx, "u01-l01", ex)).toEqual([{ id: "dhonnobad", own: true }]);
  });

  it("scans a sentence token by token and marks the lesson's own words", () => {
    const ex = { id: "e1", type: "word_bank", prompt: bn("আমি ভালো আছি।"), direction: "bn_to_en", words: [], answer: [] } as unknown as Exercise;
    expect(targetsFor(idx, "u02-l03", ex)).toEqual([
      { id: "ami", own: false },
      { id: "bhalo", own: false },
      { id: "achhi", own: true },
    ]);
  });

  it("matches multi-word entries as a contiguous run", () => {
    const ex = { id: "e1", type: "listen_select", audio: bn("কী খবর?"), options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "u01-l01", ex).map((t) => t.id)).toEqual(["ki-khobor"]);
  });

  it("maps every pair of a match_pairs exercise, once each", () => {
    const ex = {
      id: "m1",
      type: "match_pairs",
      pairs: [bn("আমি"), bn("তুমি"), bn("ভালো"), bn("আমি")],
    } as Exercise;
    expect(targetsFor(idx, "u02-l03", ex).map((t) => t.id)).toEqual(["ami", "tumi", "bhalo"]);
  });

  it("maps a script glyph", () => {
    const ex = { id: "g", type: "script_recognize", glyph: "ক", options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "s02-l01", ex).map((t) => t.id)).toEqual(["l-ka"]);
  });

  it("prefers the lesson's own word for homographs", () => {
    const ex = { id: "e", type: "select_translation", prompt: bn("না"), direction: "bn_to_en", options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "u09-l01", ex)).toEqual([{ id: "na2", own: true }]);
    expect(targetsFor(idx, "u01-l01", ex)).toEqual([{ id: "na", own: true }]);
  });

  it("ignores text that is not in the lexicon", () => {
    const ex = { id: "e", type: "select_translation", prompt: bn("অজানা"), direction: "bn_to_en", options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "u01-l01", ex)).toEqual([]);
  });
});

describe("recycle (generated review) exercises", () => {
  it("round-trips the word id through the exercise id", () => {
    const id = reviewExerciseId(3, "dhonnobad", "u01-l01");
    expect(id).toBe("u01-l01:rv~3~dhonnobad");
    expect(reviewWordId(id)).toBe("dhonnobad");
    expect(reviewWordId("rv~3~na")).toBe("na");
    expect(reviewWordId("e01")).toBeUndefined();
  });

  it("targets exactly the encoded word, whatever the prompt says", () => {
    const ex = { id: reviewExerciseId(0, "tumi", "u02-l01"), type: "select_translation", prompt: bn("আমি"), direction: "bn_to_en", options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "u02-l01", ex)).toEqual([{ id: "tumi", own: true }]);
  });

  it("drops an encoded id that is not in the index", () => {
    const ex = { id: reviewExerciseId(0, "ghost"), type: "select_translation", prompt: bn("আমি"), direction: "bn_to_en", options: [], answer: 0 } as Exercise;
    expect(targetsFor(idx, "practice", ex)).toEqual([]);
  });
});

describe("gradesFor", () => {
  const t = (id: string, own: boolean) => ({ id, own });
  it("correct: every word good", () => {
    expect(gradesFor([t("a", false), t("b", true)], true)).toEqual([
      { id: "a", grade: "good" },
      { id: "b", grade: "good" },
    ]);
  });
  it("wrong sentence: blames only the lesson's own words", () => {
    expect(gradesFor([t("a", false), t("b", true)], false)).toEqual([{ id: "b", grade: "again" }]);
  });
  it("wrong with no own words: blames all", () => {
    expect(gradesFor([t("a", false), t("b", false)], false).map((g) => g.id)).toEqual(["a", "b"]);
  });
});
