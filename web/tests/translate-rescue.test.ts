import { describe, expect, it } from "vitest";
import { getTranslateData } from "@/lib/translate/data";
import { allowedTypos, damerau, typoDistance } from "@/lib/translate/fuzzy";
import { bengaliSplits, describeSplit, englishStems } from "@/lib/translate/inflect";
import { prepare, searchCourse, suggest } from "@/lib/translate/search";
import type { TItem } from "@/lib/translate/types";

const items: TItem[] = [
  { bn: "পানি", tr: "pani", en: "water", pos: "noun" },
  { bn: "ভাত", tr: "bhat", en: "rice", pos: "noun" },
  { bn: "ছেলে", tr: "chhele", en: "boy", pos: "noun" },
  { bn: "বাড়ি", tr: "bari", en: "home", pos: "noun" },
  { bn: "ঢাকা", tr: "dhaka", en: "Dhaka", pos: "noun" },
  { bn: "ধন্যবাদ", tr: "dhonnobad", en: "thank you", pos: "phrase" },
  { bn: "আমি", tr: "ami", en: "I", pos: "pronoun" },
  { bn: "খাই", tr: "khai", en: "(I/we) eat", alt: ["eat"], pos: "verb" },
  { bn: "পান করি", tr: "pan kori", en: "drink", pos: "verb" },
  { bn: "বন্ধু", tr: "bondhu", en: "friend", pos: "noun" },
  { bn: "আমি ভাত খাই।", tr: "ami bhat khai.", en: "I eat rice.", s: 1 },
];
const px = prepare(items);
const phrase = (q: string) => {
  const r = searchCourse(px, q);
  if (r.kind !== "phrase") throw new Error(`expected phrase for ${q}, got ${r.kind}`);
  return r;
};

describe("typo distance", () => {
  it("counts a swap of neighbours as one step", () => {
    expect(damerau("thank", "thnak")).toBe(1);
    expect(damerau("water", "watre")).toBe(1);
    expect(damerau("water", "wter")).toBe(1);
    expect(damerau("water", "wxter")).toBe(1);
    expect(damerau("abc", "xyz", 2)).toBe(3);
    expect(damerau("abcdef", "ab", 2)).toBe(3);
  });

  it("forgives none under 4 letters, one for 4-7, two for 8 or more", () => {
    expect([3, 4, 7, 8, 12].map(allowedTypos)).toEqual([0, 1, 1, 2, 2]);
    expect(typoDistance("cat", "cut")).toBe(-1);
    expect(typoDistance("watr", "water")).toBe(1);
    expect(typoDistance("wtr", "water")).toBe(-1);
    expect(typoDistance("watrr", "water")).toBe(1);
    expect(typoDistance("wattrr", "water")).toBe(-1); // 2 away, but 6 letters allow only 1
    expect(typoDistance("dhonobbad", "dhonnobad")).toBe(2); // 9 letters allow 2
    expect(typoDistance("water", "water")).toBe(-1); // exact matches aren't typos
  });
});

describe("Did you mean (typos)", () => {
  it("offers the close word when nothing matches, ranked below exact matches", () => {
    const r = phrase("watr");
    expect(r.hits).toEqual([]);
    expect(r.suggestions?.[0]).toMatchObject({ label: "water", distance: 1, via: "en" });
    // A real match never gets suggestions.
    expect(phrase("water").suggestions).toBeUndefined();
  });

  it("works on romanized spelling too", () => {
    expect(suggest(px, "bhut")[0].item.bn).toBe("ভাত");
    expect(suggest(px, "dhonnobod")[0].item.bn).toBe("ধন্যবাদ");
    // Doubled letters and aa/ee/oo are already folded together, so those are exact matches, not typos.
    expect(suggest(px, "bhatt")).toEqual([]);
    expect(phrase("bhatt").hits[0].item.bn).toBe("ভাত");
  });

  it("a whole phrase one swap away beats word-by-word", () => {
    const r = phrase("thnak you");
    expect(r.suggestions?.[0]).toMatchObject({ label: "thank you", whole: true });
  });

  it("does not guess for very short words or for Bengali script", () => {
    expect(suggest(px, "wat")).toEqual([]);
    expect(suggest(px, "পানী")).toEqual([]);
  });

  it("suggests per word inside a multi-word query", () => {
    const r = searchCourse(px, "boy frend");
    expect(r.kind).toBe("words");
    if (r.kind === "words") {
      expect(r.words[0].hit?.item.bn).toBe("ছেলে");
      expect(r.words[1].hit).toBeUndefined();
      expect(r.words[1].suggestion?.label).toBe("friend");
    }
  });

  it("works against the real course", () => {
    const real = prepare(getTranslateData().items);
    const r = searchCourse(real, "thnak you");
    expect(r.kind === "phrase" && r.suggestions?.[0].item.bn).toBe("ধন্যবাদ");
  });
});

describe("Bengali endings", () => {
  it("lists splits shortest-removal first, up to two endings", () => {
    const sp = bengaliSplits("ভাতটাকে");
    expect(sp.some((x) => x.base === "ভাত" && x.suffixes.map((s) => s.s).join() === "টা,কে")).toBe(true);
    expect(describeSplit("ভাতটা", bengaliSplits("ভাতটা").find((x) => x.base === "ভাত")!)).toBe("ভাতটা → ভাত + -টা 'the'");
  });

  it.each([
    ["ভাতটা", "ভাত", "ভাতটা → ভাত + -টা 'the'"],
    ["ছেলেরা", "ছেলে", "ছেলেরা → ছেলে + -রা 'plural (people)'"],
    ["ছেলেদের", "ছেলে", "ছেলেদের → ছেলে + -দের 'of / to (plural)'"],
    ["বাড়িতে", "বাড়ি", "বাড়িতে → বাড়ি + -তে 'in / at'"],
    ["ঢাকায়", "ঢাকা", "ঢাকায় → ঢাকা + -য় 'in / at'"],
    ["ভাতকে", "ভাত", "ভাতকে → ভাত + -কে 'to / object marker'"],
    ["ভাতে", "ভাত", "ভাতে → ভাত + -ে 'in / at'"],
    ["ভাতের", "ভাত", "ভাতের → ভাত + -ের 'of (-er)'"],
    ["বাড়ির", "বাড়ি", "বাড়ির → বাড়ি + -র 'of'"],
  ])("%s finds %s", (word, base, note) => {
    const r = phrase(word);
    expect(r.hits[0].item.bn).toBe(base);
    expect(r.note).toBe(note);
  });

  it("two endings: ভাতটাকে = ভাত + -টা + -কে", () => {
    const r = phrase("ভাতটাকে");
    expect(r.hits[0].item.bn).toBe("ভাত");
    expect(r.note).toContain("-টা 'the' + -কে");
  });

  it("an exact word is never stripped", () => {
    expect(phrase("ছেলে").note).toBeUndefined();
  });

  it("a word that isn't in the course stays not found", () => {
    const r = phrase("ঘোড়াটা");
    expect(r.hits).toEqual([]);
    expect(r.note).toBeUndefined();
  });

  it("is used per word in a longer phrase", () => {
    const r = searchCourse(px, "ভাতটা খাই");
    expect(r.kind).toBe("words");
    if (r.kind === "words") {
      expect(r.words[0].hit?.item.bn).toBe("ভাত");
      expect(r.words[0].note).toContain("-টা 'the'");
      expect(r.words[1].hit?.item.bn).toBe("খাই");
    }
  });
});

describe("English word forms", () => {
  it("lists base candidates for plurals, -ing and -ed", () => {
    expect(englishStems("boys")).toContain("boy");
    expect(englishStems("babies")).toContain("baby");
    expect(englishStems("watches")).toContain("watch");
    expect(englishStems("drinking")).toContain("drink");
    expect(englishStems("making")).toContain("make");
    expect(englishStems("running")).toContain("run");
    expect(englishStems("loved")).toContain("love");
    expect(englishStems("stopped")).toContain("stop");
    expect(englishStems("studied")).toContain("study");
    expect(englishStems("is")).toEqual([]);
  });

  it.each([
    ["boys", "ছেলে", "boys → boy"],
    ["friends", "বন্ধু", "friends → friend"],
    ["eating", "খাই", "eating → eat"],
    ["drinking", "পান করি", "drinking → drink"],
    ["Waters", "পানি", "Waters → water"],
  ])("%s finds the base gloss", (q, bn, note) => {
    const r = phrase(q);
    expect(r.hits[0].item.bn).toBe(bn);
    expect(r.note).toBe(note);
  });

  it("maps forms inside a longer query", () => {
    const r = searchCourse(px, "boys drinking water now");
    expect(r.kind).toBe("words");
    if (r.kind === "words") {
      expect(r.words.map((w) => w.hit?.item.bn)).toEqual(["ছেলে", "পান করি", "পানি", undefined]);
      expect(r.words[0].note).toBe("boys → boy");
    }
  });
});

describe("real course", () => {
  const real = prepare(getTranslateData().items);
  it("finds a base word for a plural, and never matches a stem through a letter's gloss", () => {
    const r = searchCourse(real, "teachers");
    expect(r.kind === "phrase" && r.note).toBe("teachers → teacher");
    expect(r.kind === "phrase" && r.hits[0].item.bn).toBe("শিক্ষক");
    const dogs = searchCourse(real, "dogs");
    expect(dogs.kind === "phrase" && dogs.note).toBeUndefined();
  });
});
