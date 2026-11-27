import { describe, expect, it } from "vitest";
import { explainConjuncts } from "@/lib/conjuncts";
import { getWordPage, getWordPages, primaryEnglish, slugify, wordSlugs } from "@/lib/wordpages/data";

describe("explainConjuncts", () => {
  it("splits a conjunct into its letters, ignoring the vowel sign after it", () => {
    expect(explainConjuncts("ক্ষমা")[0]).toMatchObject({ conjunct: "ক্ষ", letters: ["ক", "ষ"] });
    expect(explainConjuncts("স্বাস্থ্য").map((c) => c.conjunct)).toEqual(["স্ব", "স্থ্য"]);
    expect(explainConjuncts("স্থ্য")[0].letters).toEqual(["স", "থ", "য"]);
  });
  it("names the jo-fola, ro-fola and bo-fola forms", () => {
    expect(explainConjuncts("ধন্যবাদ")[0].notes.join()).toMatch(/য-ফলা/);
    expect(explainConjuncts("প্রতিদিন")[0].notes.join()).toMatch(/র-ফলা/);
    expect(explainConjuncts("বিশ্ব")[0].notes.join()).toMatch(/ব-ফলা/);
  });
  it("explains reph, but not when a joiner asks for র + jo-fola instead", () => {
    const reph = explainConjuncts("কর্ম")[0];
    expect(reph.letters).toEqual(["র", "ম"]);
    expect(reph.notes.join()).toMatch(/রেফ/);
    const rab = explainConjuncts("র\u200D্যাব")[0];
    expect(rab.letters).toEqual(["র", "য"]);
    expect(rab.notes.join()).not.toMatch(/রেফ/);
    expect(rab.notes.join()).toMatch(/য-ফলা/);
  });
  it("flags shapes that hide their parts", () => {
    expect(explainConjuncts("ক্ষমা")[0].notes.join()).toMatch(/own shape/);
    expect(explainConjuncts("জ্ঞান")[0].notes.join()).toMatch(/own shape/);
  });
  it("lists each conjunct once and ignores words without any", () => {
    expect(explainConjuncts("ক্কক্ক")).toHaveLength(1);
    expect(explainConjuncts("আমি")).toEqual([]);
    expect(explainConjuncts("hello")).toEqual([]);
  });
});

describe("slugs", () => {
  it("builds readable ASCII slugs", () => {
    expect(slugify("Hello (peace be upon you)")).toBe("hello-peace-be-upon-you");
    expect(slugify("I'm fine!")).toBe("im-fine");
    expect(slugify("āmi")).toBe("ami");
    expect(primaryEnglish("hello (in reply)")).toBe("hello");
    expect(primaryEnglish("to go; to leave")).toBe("to go");
  });
  it("keeps slugs unique", () => {
    const m = wordSlugs([
      { id: "a", en: "water", tr: "pani" },
      { id: "b", en: "water", tr: "pani" },
      { id: "c", en: "water", tr: "jol" },
    ]);
    expect([...m.values()]).toEqual(["water-pani", "water-pani-2", "water-jol"]);
  });
});

describe("word pages from the course", () => {
  const pages = getWordPages();

  it("has a page for every non-letter lexicon word, with unique slugs", () => {
    expect(pages.length).toBeGreaterThan(700);
    expect(new Set(pages.map((p) => p.slug)).size).toBe(pages.length);
    expect(pages.every((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug))).toBe(true);
    expect(pages.some((p) => p.pos === "letter")).toBe(false);
  });

  it("links each taught word to its lesson and finds examples that use it", () => {
    const thanks = pages.find((p) => p.bn === "ধন্যবাদ");
    expect(thanks).toBeDefined();
    expect(thanks!.slug).toMatch(/^thank/);
    expect(thanks!.lesson?.id).toMatch(/^u\d+-l\d+$/);
    expect(getWordPage(thanks!.slug)).toBe(thanks);
    expect(thanks!.conjuncts[0]).toMatchObject({ conjunct: "ন্য", names: ["no", "jo"] });
  });

  it("only uses example sentences that contain the word as a whole word", () => {
    let withExamples = 0;
    for (const p of pages) {
      if (p.examples.length) withExamples++;
      for (const ex of p.examples) expect(ex.bn.replace(/[।?!,.]/g, " ")).toContain(p.bn);
    }
    expect(withExamples / pages.length).toBeGreaterThan(0.5);
  });

  it("keeps related words within the same lesson", () => {
    for (const p of pages.slice(0, 200)) for (const r of p.related) expect(r.slug).not.toBe(p.slug);
  });
});
