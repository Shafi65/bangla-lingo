import { describe, expect, it } from "vitest";
import { getCourse, getLesson } from "../src/lib/content";
import { buildWriteGroups, flattenLetters, lettersOfLesson } from "../src/lib/write/letters";
import { sanitize, withState } from "../src/lib/write/storage";

describe("write letters", () => {
  it("builds groups from the script track with vocab-backed letters", () => {
    const units = getCourse().units.filter((u) => u.track === "script");
    const groups = buildWriteGroups(
      units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons.map((l) => l.id) })),
      getLesson,
    );
    const all = flattenLetters(groups);
    expect(all.length).toBeGreaterThan(40);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const l of all) {
      expect(l.tr).toBeTruthy();
      expect(l.en).toBeTruthy();
      expect(l.speak).toContain(l.glyph.normalize("NFC")[0]);
    }
    const kinds = new Set(all.map((l) => l.kind));
    expect(kinds).toEqual(new Set(["vowel", "consonant", "sign", "mark"]));
    expect(all.some((l) => l.glyph === "অ")).toBe(true);
    expect(all.some((l) => l.glyph === "া" && l.kind === "sign")).toBe(true);
  });

  it("reads letters from the lesson title and ignores review lessons", () => {
    const lesson = {
      id: "x",
      title: "Vowels 1: অ আ",
      vocab: [
        { id: "l-o", bn: "অ", tr: "o", en: "o" },
        { id: "l-a", bn: "আ", tr: "a", en: "a" },
        { id: "am", bn: "আম", tr: "am", en: "mango" },
      ],
    };
    expect(lettersOfLesson(lesson, "vowel").map((l) => l.glyph)).toEqual(["অ", "আ"]);
    expect(lettersOfLesson({ ...lesson, title: "Review: look-alikes" }, "vowel")).toEqual([]);
  });
});

describe("write progress", () => {
  it("sanitises stored data and never downgrades a letter", () => {
    expect(sanitize({ letters: { a: "traced", b: "nope", c: 3 } }).letters).toEqual({ a: "traced" });
    expect(sanitize("garbage").letters).toEqual({});
    const p = sanitize({ letters: { a: "written" } });
    expect(withState(p, "a", "traced")).toBe(p);
    expect(withState(p, "b", "traced").letters).toEqual({ a: "written", b: "traced" });
  });
});
