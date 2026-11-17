import { describe, expect, it } from "vitest";
import { getTranslateData } from "@/lib/translate/data";
import { detectLang, detectScript, normBn, normRoman, prepare, romanizeWithCourse, searchCourse, tierOf } from "@/lib/translate/search";
import type { TItem } from "@/lib/translate/types";

// Real course index (content/), as the page ships it.
const data = getTranslateData();
const px = prepare(data.items);
const top = (q: string) => {
  const r = searchCourse(px, q);
  if (r.kind !== "phrase") throw new Error(`expected phrase results for ${q}, got ${r.kind}`);
  return r.hits;
};

describe("direction detection", () => {
  it("reads the script typed", () => {
    expect(detectScript("কেমন আছেন?")).toBe("bn");
    expect(detectScript("thank you")).toBe("latin");
    expect(detectScript("  ?! 12 ")).toBe("none");
    expect(detectLang("আমি ami")).toBe("bn");
    expect(detectLang("hello আমি")).toBe("en");
    expect(detectLang("")).toBeNull();
  });
});

describe("normalisation", () => {
  it("NFC-normalizes Bengali and strips danda and punctuation", () => {
    const nfd = "কেমন আছেন?".normalize("NFD");
    expect(normBn(nfd)).toBe(normBn("কেমন আছেন।"));
  });
  it("folds romanized spelling variants", () => {
    expect(normRoman("dhonnobad")).toBe(normRoman("dhonobad"));
    expect(normRoman("Shundor!")).toBe(normRoman("sundor"));
    expect(normRoman("cha~d")).toBe("chad");
  });
  it("ranks exact, whole-word and prefix tiers", () => {
    expect(tierOf("thank you", "thank you")).toBe(0);
    expect(tierOf("yes thank you", "thank you")).toBe(1);
    expect(tierOf("thank you", "than")).toBe(2);
    expect(tierOf("thank you", "ank")).toBe(-1);
  });
});

describe("course search (real content)", () => {
  it("English: 'thank you' finds ধন্যবাদ first, with its lesson", () => {
    const hits = top("Thank you!");
    expect(hits[0].item.bn).toBe("ধন্যবাদ");
    expect(hits[0].tier).toBe(0);
    expect(hits[0].item.l && data.lessons[hits[0].item.l]).toBeTruthy();
    // words before example sentences
    const firstSentence = hits.findIndex((h) => h.item.s);
    expect(firstSentence === -1 || firstSentence > 0).toBe(true);
  });

  it("Bengali, NFC or NFD, finds the same entry", () => {
    expect(top("আমি")[0].item.bn).toBe("আমি");
    expect(top("আমি".normalize("NFD"))[0].item.bn).toBe("আমি");
  });

  it("romanized input matches the transliteration", () => {
    expect(top("ami")[0].item.bn).toBe("আমি");
    expect(top("dhonobad")[0].item.bn).toBe("ধন্যবাদ");
    expect(top("kemon achen")[0].item.bn).toBe("কেমন আছেন?");
    expect(top("kemon achen")[0].tier).toBe(0);
  });

  it("prefix while typing", () => {
    const hits = top("thank");
    expect(hits.some((h) => h.item.bn === "ধন্যবাদ")).toBe(true);
  });

  it("returns at most 8 and reports the total", () => {
    const r = searchCourse(px, "you");
    expect(r.kind).toBe("phrase");
    if (r.kind === "phrase") {
      expect(r.hits.length).toBeLessThanOrEqual(8);
      expect(r.total).toBeGreaterThanOrEqual(r.hits.length);
    }
  });

  it("ships only compact fields", () => {
    const allowed = new Set(["bn", "tr", "en", "alt", "pos", "kb", "kt", "n", "l", "s", "a"]);
    for (const it of data.items) for (const k of Object.keys(it)) expect(allowed.has(k)).toBe(true);
  });
});

describe("ranking and fallback (synthetic)", () => {
  const items: TItem[] = [
    { bn: "পানি", tr: "pani", en: "water", alt: ["drinking water"], pos: "noun", l: "x1" },
    { bn: "জল", tr: "jol", en: "water (Kolkata / Hindu usage)", pos: "noun" },
    { bn: "আমি পানি খাই।", tr: "ami pani khai.", en: "I drink water.", s: 1 },
    { bn: "আমি", tr: "ami", en: "I", pos: "pronoun" },
    { bn: "খুশি", tr: "khushi", en: "happy", alt: ["glad", "pleased"], pos: "adj" },
    { bn: "বাজার", tr: "bajar", en: "market", pos: "noun" },
    { bn: "অ", tr: "o", en: "o as in 'or'", pos: "letter" },
  ];
  const p = prepare(items);

  it("exact gloss beats a sentence that contains it", () => {
    const r = searchCourse(p, "water");
    expect(r.kind === "phrase" && r.hits.map((h) => h.item.bn)).toEqual(["পানি", "জল", "আমি পানি খাই।"]);
  });

  it("matches alternative glosses", () => {
    const r = searchCourse(p, "glad");
    expect(r.kind === "phrase" && r.hits[0].item.bn).toBe("খুশি");
  });

  it("multi-word English with no full match falls back to per-word results, skipping articles", () => {
    const r = searchCourse(p, "The Happy market!");
    expect(r.kind).toBe("words");
    if (r.kind === "words") {
      expect(r.words.map((w) => w.word)).toEqual(["Happy", "market"]);
      expect(r.words.map((w) => w.hit?.item.bn)).toEqual(["খুশি", "বাজার"]);
    }
  });

  it("per-word fallback marks unknown words", () => {
    const r = searchCourse(p, "happy zebra");
    expect(r.kind === "words" && r.words[1]).toEqual({ word: "zebra" });
  });

  it("a whole-phrase match suppresses the fallback", () => {
    expect(searchCourse(p, "drink water").kind).toBe("phrase");
  });

  it("romanizes Bengali only when every word is known", () => {
    expect(romanizeWithCourse(p, "আমি পানি।")).toBe("ami pani");
    expect(romanizeWithCourse(p, "আমি চা")).toBeNull();
  });

  it("empty or punctuation-only input gives nothing", () => {
    expect(searchCourse(p, "  ?? ").kind).toBe("empty");
  });
});
