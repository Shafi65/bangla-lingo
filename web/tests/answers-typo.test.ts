import { describe, expect, it } from "vitest";
import { answersMatch, checkAnswer, checkResponse, isTypoOf, isTypoWord, normalizeAnswer, type Expects } from "@/lib/answers";
import { graphemes, normalizeBengali } from "@/lib/bnNormalize";
import { getAllLessons } from "@/lib/content";
import type { Exercise } from "@/lib/types";

const bn = (b: string, tr = "x", en = "y") => ({ bn: b, tr, en });
const ZWJ = "\u200D";
const ZWNJ = "\u200C";

describe("normalizeBengali", () => {
  it("removes zero-width joiners so a keyboard's র\u200D্য matches র্য", () => {
    expect(answersMatch("র" + ZWJ + "্যাব", "র্যাব")).toBe(true);
  });
  it("removes ZWNJ, zero-width space, word joiner, BOM and soft hyphen", () => {
    for (const c of [ZWNJ, "\u200B", "\u2060", "\uFEFF", "\u00AD"]) {
      expect(answersMatch("ধন্য" + c + "বাদ", "ধন্যবাদ")).toBe(true);
    }
  });
  it("turns ত্ + ZWJ and word-final ত্ into ৎ (khanda ta)", () => {
    expect(normalizeBengali("হঠা" + "ত্" + ZWJ)).toBe("হঠাৎ");
    expect(answersMatch("হঠাত্", "হঠাৎ")).toBe(true);
    expect(answersMatch("হঠাত্ এল", "হঠাৎ এল")).toBe(true);
  });
  it("keeps a mid-word ত্ conjunct (ত্ত, ত্র) untouched", () => {
    expect(normalizeBengali("উত্তর")).toBe("উত্তর");
    expect(normalizeBengali("পত্র")).toBe("পত্র");
  });
  it("collapses a doubled hasanta and a vowel sign typed twice", () => {
    expect(answersMatch("ধন্্যবাদ", "ধন্যবাদ")).toBe(true);
    expect(answersMatch("কিি", "কি")).toBe(true);
    expect(answersMatch("চাঁঁদ", "চাঁদ")).toBe(true);
  });
  it("does not merge genuinely different words", () => {
    expect(answersMatch("কি", "কী")).toBe(false);
    expect(answersMatch("খাই", "খায়")).toBe(false);
  });
  it("leaves English untouched apart from invisible characters", () => {
    expect(normalizeAnswer("thank" + ZWJ + " you")).toBe("thank you");
  });
});

describe("graphemes", () => {
  it("keeps a conjunct with its vowel sign", () => {
    expect(graphemes("স্কুল")).toEqual(["স্কু", "ল"]);
    expect(graphemes("ক্ষমা")).toEqual(["ক্ষ", "মা"]);
  });
});

describe("isTypoWord: Bengali script", () => {
  it("forgives one spelling-only confusion in a word of 3+ graphemes", () => {
    expect(isTypoWord("শুক্রবার", "শুক্রবার", "bn")).toBe(false); // identical is not a typo
    expect(isTypoWord("বাংলাদেস", "বাংলাদেশ", "bn")).toBe(true); // স for শ
    expect(isTypoWord("পরিক্ষা", "পরীক্ষা", "bn")).toBe(true); // ি for ী
    expect(isTypoWord("কারন", "কারণ", "bn")).toBe(true); // ন for ণ
    expect(isTypoWord("রঙ্গিন", "রংগিন", "bn")).toBe(false); // different length: not a single swap
  });
  it("never forgives tense, aspect, person or case changes", () => {
    expect(isTypoWord("দেখলাম", "দেখছিলাম", "bn")).toBe(false);
    expect(isTypoWord("দেখেছিলাম", "দেখছিলাম", "bn")).toBe(false);
    expect(isTypoWord("খায়", "খাই", "bn")).toBe(false);
    expect(isTypoWord("যাচ্ছে", "যাচ্ছি", "bn")).toBe(false);
    expect(isTypoWord("বাড়িতে", "বাড়ির", "bn")).toBe(false);
  });
  it("never forgives other letter swaps", () => {
    expect(isTypoWord("কাল", "কাজ", "bn")).toBe(false);
    expect(isTypoWord("তালা", "থালা", "bn")).toBe(false); // ত/থ aspiration is meaningful
  });
  it("is strict on short words (কি / কী mean different things)", () => {
    expect(isTypoWord("কি", "কী", "bn")).toBe(false);
  });
  it("never crosses scripts or applies in an English answer", () => {
    expect(isTypoWord("dhonnobad", "ধন্যবাদ", "bn")).toBe(false);
    expect(isTypoWord("বাংলাদেস", "বাংলাদেশ", "en")).toBe(false);
  });
});

describe("isTypoWord: romanized Bengali", () => {
  it("forgives nothing: aspiration and doubling are meaningful", () => {
    expect(isTypoWord("kota", "kotha", "bn")).toBe(false);
    expect(isTypoWord("pata", "patta", "bn")).toBe(false);
    expect(isTypoWord("likhte", "sikhte", "bn")).toBe(false);
  });
});

describe("isTypoWord: English", () => {
  it("forgives a missing, extra or swapped letter in longer words", () => {
    expect(isTypoWord("becuase", "because", "en")).toBe(true);
    expect(isTypoWord("freind", "friend", "en")).toBe(true);
    expect(isTypoWord("hosptal", "hospital", "en")).toBe(true);
    expect(isTypoWord("tomorow", "tomorrow", "en")).toBe(true); // one missing letter
    expect(isTypoWord("tommorow", "tomorrow", "en")).toBe(false); // two slips
  });
  it("does not forgive grammar endings", () => {
    expect(isTypoWord("eats", "eat", "en")).toBe(false);
    expect(isTypoWord("likes", "liked", "en")).toBe(false);
    expect(isTypoWord("drinks", "drink", "en")).toBe(false);
    expect(isTypoWord("quite", "quiet", "en")).toBe(false);
  });
  it("does not forgive a substituted letter (usually another word)", () => {
    expect(isTypoWord("wrote", "write", "en")).toBe(false);
    expect(isTypoWord("women", "woman", "en")).toBe(false);
    expect(isTypoWord("lather", "rather", "en")).toBe(false);
    expect(isTypoWord("sister", "sitter", "en")).toBe(false);
  });
  it("does not touch the first letter or short words", () => {
    expect(isTypoWord("rbother", "brother", "en")).toBe(false);
    expect(isTypoWord("from", "form", "en")).toBe(false);
  });
});

describe("isTypoOf: whole answers", () => {
  it("allows exactly one word with a typo", () => {
    expect(isTypoOf("I am going to the hosptal", "I am going to the hospital", "en")).toBe(true);
    expect(isTypoOf("I am goign to the hosptal", "I am going to the hospital", "en")).toBe(false);
  });
  it("needs the same number of words", () => {
    expect(isTypoOf("I am going the hospital", "I am going to the hospital", "en")).toBe(false);
  });
  it("is not true for an exact match (that is just correct)", () => {
    expect(isTypoOf("thank you", "Thank you!", "en")).toBe(false);
  });
});

describe("checkAnswer", () => {
  const tt: Exercise = {
    id: "t",
    type: "type_translation",
    prompt: bn("আমি হাসপাতালে যাচ্ছি", "ami haspatale jacchi", "I am going to the hospital"),
    direction: "bn_to_en",
    accepted: ["I am going to the hospital", "I'm going to the hospital"],
  };
  it("returns plain correct for an exact match", () => {
    expect(checkAnswer(tt, { kind: "text", value: "i'm going to the hospital." })).toEqual({ correct: true });
  });
  it("returns the accepted spelling for a forgiven typo", () => {
    expect(checkAnswer(tt, { kind: "text", value: "I am going to the hosptal" })).toEqual({
      correct: true,
      typo: "I am going to the hospital",
    });
    expect(checkResponse(tt, { kind: "text", value: "I am going to the hosptal" })).toBe(true);
  });
  it("still marks real mistakes wrong", () => {
    expect(checkAnswer(tt, { kind: "text", value: "I am going to the school" }).correct).toBe(false);
  });
  it("applies to typed Bengali answers", () => {
    const en2bn: Exercise = { ...tt, direction: "en_to_bn", accepted: ["আমি বাংলাদেশে যাচ্ছি", "ami bangladeshe jacchi"] };
    expect(checkAnswer(en2bn, { kind: "text", value: "আমি বাংলাদেসে যাচ্ছি" })).toEqual({ correct: true, typo: "আমি বাংলাদেশে যাচ্ছি" });
    expect(checkAnswer(en2bn, { kind: "text", value: "আমি বাংলাদেশে যাচ্ছে" }).correct).toBe(false);
  });
  it("applies to typed fill-in-the-blank but not to multiple choice", () => {
    const typed: Exercise = { id: "f", type: "fill_blank", sentence: bn("আজ ___ দিন"), blank: "পরীক্ষার" };
    expect(checkAnswer(typed, { kind: "text", value: "পরিক্ষার" })).toEqual({ correct: true, typo: "পরীক্ষার" });
    const choice: Exercise = { ...typed, options: ["a", "b"], answer: 0 };
    expect(checkAnswer(choice, { kind: "index", value: 1 }).correct).toBe(false);
  });
});

describe("typo tolerance on the real course", () => {
  // Accepted-answer sets per typed exercise. A forgiven typo must never turn one exercise's answer
  // into a *different* exercise's answer: that would accept a genuinely different sentence as right.
  // (Alternative spellings inside one exercise, e.g. porchhilam / porchilam, are fine.)
  const sets: { set: Set<string>; expects: Expects }[] = [];
  for (const l of getAllLessons()) {
    for (const ex of l.exercises) {
      const raw =
        ex.type === "type_translation" ? ex.accepted : ex.type === "fill_blank" && !ex.options ? [ex.blank, ...(ex.accepted ?? [])] : [];
      const expects: Expects = ex.type === "type_translation" && ex.direction === "bn_to_en" ? "en" : "bn";
      const set = new Set(raw.map(normalizeAnswer).filter(Boolean));
      if (set.size) sets.push({ set, expects });
    }
  }
  const owners = new Map<string, { same: Set<string>; expects: Set<Expects> }>();
  for (const { set, expects } of sets) {
    for (const a of set) {
      const o = owners.get(a) ?? { same: new Set<string>(), expects: new Set<Expects>() };
      set.forEach((x) => o.same.add(x));
      o.expects.add(expects);
      owners.set(a, o);
    }
  }

  it("has answers to check", () => {
    expect(owners.size).toBeGreaterThan(100);
  });

  it("no answer counts as a typo of a different exercise's answer", () => {
    const byWords = new Map<number, string[]>();
    for (const a of owners.keys()) {
      const n = a.split(" ").length;
      byWords.set(n, [...(byWords.get(n) ?? []), a]);
    }
    const clashes: string[] = [];
    for (const group of byWords.values()) {
      for (const a of group) {
        for (const b of group) {
          const target = owners.get(b)!;
          if (a === b || target.same.has(a)) continue; // same exercise's own variants
          for (const expects of target.expects) if (isTypoOf(a, b, expects)) clashes.push(`"${a}" ~ "${b}"`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
