import { describe, expect, it } from "vitest";
import { getTranslateData } from "@/lib/translate/data";
import { detectRomanized, classifyWord } from "@/lib/translate/romanized";
import { composeRoman, splitWords } from "@/lib/translate/romanize";
import { prepare } from "@/lib/translate/search";

const px = prepare(getTranslateData().items);
const roman = (t: string) => detectRomanized(px, t).romanized;

describe("romanized Bengali detection", () => {
  it.each(["ami bhat khai", "tumi kemon acho", "dhonnobad", "kemon achen", "ami pani khai", "ami bhalo achi", "Ami bhat khai."])(
    "reads %j as romanized Bengali",
    (t) => expect(roman(t)).toBe(true),
  );

  it.each([
    "thank you",
    "where is the market",
    "I am hungry",
    "good morning",
    "How are you?",
    "the weather is lovely today",
    "ami want water",
    "I love my pain medicine",
    "water",
    "zebra crossing",
    "bhalobasha", // one unknown word is never guessed
  ])("keeps %j as English", (t) => expect(roman(t)).toBe(false));

  it("English wins a tie: 'bad' and 'pain' are English words even though the course romanizes them", () => {
    expect(classifyWord(px, "bad")).toBe("english");
    expect(classifyWord(px, "pain")).toBe("english");
    expect(roman("bad")).toBe(false);
    expect(roman("pain")).toBe(false);
    expect(roman("bad pain")).toBe(false);
  });

  it("'ami' alone is read as Bengali (a course word that is not an English word); the toggle overrides", () => {
    expect(classifyWord(px, "ami")).toBe("course");
    expect(roman("ami")).toBe(true);
  });

  it("never fires on Bengali script, digits or empty text", () => {
    expect(roman("আমি ভাত খাই")).toBe(false);
    expect(roman("12345")).toBe(false);
    expect(roman("")).toBe(false);
    expect(roman("ami আমি")).toBe(false);
  });

  it("shaped unknown words (verb endings) count when two or more stand together", () => {
    expect(classifyWord(px, "zorabuchhi")).toBe("shaped");
    expect(roman("zorabuchhi nachhilam")).toBe(true);
    expect(roman("zorabuchhi")).toBe(false);
  });
});

describe("romanization of machine Bengali", () => {
  it("uses course words alone when every word is known", () => {
    expect(composeRoman(px, "আমি ভাত খাই।", null)).toEqual({ text: "ami bhat khai", approx: false });
  });

  it("fills the rest from the translator and marks the result approximate", () => {
    const bn = "আমি অচেনাশব্দ খাই";
    expect(splitWords(bn)).toHaveLength(3);
    expect(composeRoman(px, bn, ["ami", "ochenashobdo", "khay"])).toEqual({ text: "ami ochenashobdo khai", approx: true });
  });

  it("gives nothing rather than a gap when a word has no romanization", () => {
    expect(composeRoman(px, "আমি অচেনাশব্দ", null)).toBeNull();
    expect(composeRoman(px, "আমি অচেনাশব্দ", ["ami"])).toBeNull(); // misaligned
  });
});
