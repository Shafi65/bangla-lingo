import { describe, expect, it } from "vitest";
import {
  answersMatch,
  checkResponse,
  normalizeAnswer,
  seededShuffle,
  solutionFor,
} from "@/lib/answers";
import type { Exercise } from "@/lib/types";

const bn = (b: string, tr = "x", en = "y") => ({ bn: b, tr, en });

describe("normalizeAnswer", () => {
  it("lowercases and trims", () => {
    expect(normalizeAnswer("  Thank You  ")).toBe("thank you");
  });
  it("collapses internal whitespace, tabs and newlines", () => {
    expect(normalizeAnswer("see \t you\n again")).toBe("see you again");
  });
  it("strips ASCII punctuation", () => {
    expect(normalizeAnswer("Hello, world!?")).toBe("hello world");
    expect(normalizeAnswer("yes; no: maybe.")).toBe("yes no maybe");
  });
  it("strips the Bengali danda and double danda", () => {
    expect(normalizeAnswer("আমি ভালো আছি।")).toBe("আমি ভালো আছি");
    expect(normalizeAnswer("আমি ভালো আছি॥")).toBe("আমি ভালো আছি");
    expect(normalizeAnswer("আমি।তুমি")).toBe("আমি তুমি");
  });
  it("removes apostrophes without splitting the word (don't -> dont)", () => {
    expect(normalizeAnswer("don't")).toBe("dont");
    expect(normalizeAnswer("don’t")).toBe("dont"); // typographic
    expect(normalizeAnswer("don`t")).toBe("dont");
    expect(normalizeAnswer("I'm fine")).toBe("im fine");
  });
  it("treats contraction and apostrophe-less forms as equal", () => {
    expect(answersMatch("I'm fine", "im fine")).toBe(true);
    // but not expanded forms (those must be listed in `accepted`)
    expect(answersMatch("I'm fine", "I am fine")).toBe(false);
  });
  it("normalises Bengali NFD input to NFC", () => {
    // য় (U+09DF) decomposes to য (U+09AF) + ় (U+09BC); ড় / ঢ় likewise.
    const nfc = "য়"; // য়
    const nfd = "য়";
    expect(nfc).not.toBe(nfd);
    expect(normalizeAnswer(nfd)).toBe(normalizeAnswer(nfc));
    expect(answersMatch("দয়া", "দ" + nfd + "া")).toBe(true);
  });
  it("NFC normalisation covers vowel-sign decomposition (ো = ে + া)", () => {
    // U+09CB decomposes to U+09C7 U+09BE under NFD.
    const composed = "কো";
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    expect(answersMatch(composed, decomposed)).toBe(true);
  });
  it("keeps Bengali letters/marks (does not strip combining marks as punctuation)", () => {
    expect(normalizeAnswer("ধন্যবাদ")).toBe("ধন্যবাদ");
    expect(normalizeAnswer("হ্যাঁ")).toBe("হ্যাঁ");
    expect(normalizeAnswer("আসসালামু আলাইকুম")).toBe("আসসালামু আলাইকুম");
  });
  it("returns empty string for punctuation-only input", () => {
    expect(normalizeAnswer(" ।?! ")).toBe("");
  });
  it("is idempotent", () => {
    for (const s of ["Don't Panic!", "আমি ভালো আছি।", "  a  b "]) {
      expect(normalizeAnswer(normalizeAnswer(s))).toBe(normalizeAnswer(s));
    }
  });
});

describe("checkResponse", () => {
  const select: Exercise = {
    id: "s", type: "select_translation", prompt: bn("না", "na", "no"),
    direction: "bn_to_en", options: ["yes", "no", "thanks"], answer: 1,
  };
  const listen: Exercise = {
    id: "l", type: "listen_select", audio: bn("না"), options: ["হ্যাঁ", "না"], answer: 1,
  };
  const script: Exercise = {
    id: "r", type: "script_recognize", glyph: "অ", options: ["o", "a", "i"], answer: 0,
  };
  const bank: Exercise = {
    id: "w", type: "word_bank", prompt: bn("উনি আমার শিক্ষক", "uni amar shikkhok", "He is my teacher"),
    direction: "bn_to_en",
    tiles: ["He", "is", "my", "teacher", "She"],
    answer: ["He", "is", "my", "teacher"],
    alt: [["She", "is", "my", "teacher"]],
  };
  const typed: Exercise = {
    id: "t", type: "type_translation", prompt: bn("ধন্যবাদ", "dhonnobad", "thank you"),
    direction: "bn_to_en", accepted: ["Thank you", "Thanks", "dhonnobad"],
  };
  const typedBn: Exercise = {
    id: "t2", type: "type_translation", prompt: bn("ধন্যবাদ", "dhonnobad", "thank you"),
    direction: "en_to_bn", accepted: ["ধন্যবাদ", "dhonnobad"],
  };
  const match: Exercise = {
    id: "m", type: "match_pairs", pairs: [bn("না", "na", "no"), bn("জি", "ji", "yes")],
  };

  it.each([
    ["select_translation", select],
    ["listen_select", listen],
    ["script_recognize", script],
  ] as const)("%s: index must equal answer", (_n, ex) => {
    const a = (ex as { answer: number }).answer;
    expect(checkResponse(ex, { kind: "index", value: a })).toBe(true);
    expect(checkResponse(ex, { kind: "index", value: a + 1 })).toBe(false);
    expect(checkResponse(ex, { kind: "index", value: -1 })).toBe(false);
  });

  it("index exercises reject responses of the wrong kind", () => {
    expect(checkResponse(select, { kind: "text", value: "no" })).toBe(false);
    expect(checkResponse(select, { kind: "tiles", value: [1] })).toBe(false);
    expect(checkResponse(select, { kind: "matched" })).toBe(false);
  });

  describe("word_bank", () => {
    it("accepts the canonical answer", () => {
      expect(checkResponse(bank, { kind: "tiles", value: [0, 1, 2, 3] })).toBe(true);
    });
    it("accepts an alt sequence", () => {
      expect(checkResponse(bank, { kind: "tiles", value: [4, 1, 2, 3] })).toBe(true);
    });
    it("rejects wrong order, missing and extra tiles", () => {
      expect(checkResponse(bank, { kind: "tiles", value: [1, 0, 2, 3] })).toBe(false);
      expect(checkResponse(bank, { kind: "tiles", value: [0, 1, 2] })).toBe(false);
      expect(checkResponse(bank, { kind: "tiles", value: [0, 1, 2, 3, 4] })).toBe(false);
      expect(checkResponse(bank, { kind: "tiles", value: [] })).toBe(false);
    });
    it("works without `alt`", () => {
      const { alt: _alt, ...noAlt } = bank as Extract<Exercise, { type: "word_bank" }>;
      void _alt;
      expect(checkResponse(noAlt as Exercise, { kind: "tiles", value: [4, 1, 2, 3] })).toBe(false);
      expect(checkResponse(noAlt as Exercise, { kind: "tiles", value: [0, 1, 2, 3] })).toBe(true);
    });
    it("ignores case/punctuation differences in tiles vs answer", () => {
      const ex: Exercise = {
        id: "w2", type: "word_bank", prompt: bn("আমি ভালো আছি"), direction: "bn_to_en",
        tiles: ["I", "am", "fine."], answer: ["i", "am", "fine"],
      };
      expect(checkResponse(ex, { kind: "tiles", value: [0, 1, 2] })).toBe(true);
    });
    it("Bengali tiles (en_to_bn) with danda and NFD input", () => {
      const ex: Exercise = {
        id: "w3", type: "word_bank", prompt: bn("আমি ভালো আছি", "ami bhalo achhi", "I am fine"),
        direction: "en_to_bn", tiles: ["আছি।", "আমি", "ভালো"], answer: ["আমি", "ভালো", "আছি"],
      };
      expect(checkResponse(ex, { kind: "tiles", value: [1, 2, 0] })).toBe(true);
    });
    it("rejects a non-tiles response", () => {
      expect(checkResponse(bank, { kind: "text", value: "He is my teacher" })).toBe(false);
    });
  });

  describe("type_translation", () => {
    it.each([
      "thank you", "Thank You", "  THANK   YOU  ", "thank you.", "Thank you!", "thanks", "Dhonnobad",
    ])("accepts %j", (v) => {
      expect(checkResponse(typed, { kind: "text", value: v })).toBe(true);
    });
    it.each(["thank", "thankyou", "no", "", "thank you very much"])("rejects %j", (v) => {
      expect(checkResponse(typed, { kind: "text", value: v })).toBe(false);
    });
    it("accepts Bengali answers with danda, spaces and NFD input", () => {
      expect(checkResponse(typedBn, { kind: "text", value: "ধন্যবাদ।" })).toBe(true);
      expect(checkResponse(typedBn, { kind: "text", value: " ধন্যবাদ " })).toBe(true);
      expect(checkResponse(typedBn, { kind: "text", value: "ধন্যবাদ".normalize("NFD") })).toBe(true);
      expect(checkResponse(typedBn, { kind: "text", value: "DHONNOBAD" })).toBe(true);
    });
    it("handles apostrophes both ways", () => {
      const ex: Exercise = {
        id: "t3", type: "type_translation", prompt: bn("আমি জানি না"), direction: "bn_to_en",
        accepted: ["I don't know"],
      };
      expect(checkResponse(ex, { kind: "text", value: "I dont know" })).toBe(true);
      expect(checkResponse(ex, { kind: "text", value: "I don’t know" })).toBe(true);
      expect(checkResponse(ex, { kind: "text", value: "i don't know." })).toBe(true);
    });
    it("rejects a non-text response", () => {
      expect(checkResponse(typed, { kind: "index", value: 0 })).toBe(false);
    });
  });

  it("match_pairs: only `matched` is correct", () => {
    expect(checkResponse(match, { kind: "matched" })).toBe(true);
    expect(checkResponse(match, { kind: "index", value: 0 })).toBe(false);
  });
});

describe("solutionFor", () => {
  it("select bn_to_en shows the correct option", () => {
    const ex: Exercise = {
      id: "s", type: "select_translation", prompt: bn("না", "na", "no"),
      direction: "bn_to_en", options: ["yes", "no"], answer: 1,
    };
    expect(solutionFor(ex)).toEqual({ text: ex.prompt, display: "no" });
  });
  it("select en_to_bn shows the Bengali prompt", () => {
    const ex: Exercise = {
      id: "s", type: "select_translation", prompt: bn("না", "na", "no"),
      direction: "en_to_bn", options: ["হ্যাঁ", "না"], answer: 1,
    };
    expect(solutionFor(ex)).toMatchObject({ display: "না" });
  });
  it("word_bank bn_to_en joins the answer", () => {
    const ex: Exercise = {
      id: "w", type: "word_bank", prompt: bn("x"), direction: "bn_to_en", tiles: ["a", "b"], answer: ["a", "b"],
    };
    expect(solutionFor(ex)).toMatchObject({ display: "a b" });
  });
  it("type_translation uses accepted[0]", () => {
    const ex: Exercise = {
      id: "t", type: "type_translation", prompt: bn("x", "x", "fallback"), direction: "bn_to_en", accepted: ["first", "second"],
    };
    expect(solutionFor(ex)).toMatchObject({ display: "first" });
  });
  it("script_recognize returns glyph and sound", () => {
    const ex: Exercise = { id: "r", type: "script_recognize", glyph: "অ", options: ["o", "a"], answer: 1 };
    expect(solutionFor(ex)).toEqual({ glyph: "অ", sound: "a" });
  });
  it("match_pairs has no single solution", () => {
    expect(solutionFor({ id: "m", type: "match_pairs", pairs: [] })).toBeNull();
  });
});

describe("seededShuffle", () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  it("is deterministic per seed", () => {
    expect(seededShuffle(items, "e01")).toEqual(seededShuffle(items, "e01"));
  });
  it("is a permutation and does not mutate its input", () => {
    const copy = [...items];
    const out = seededShuffle(items, "abc");
    expect(items).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });
  it("differs across seeds", () => {
    const outs = new Set(["a", "b", "c", "d", "e"].map((s) => seededShuffle(items, s).join(",")));
    expect(outs.size).toBeGreaterThan(1);
  });
  it("handles empty and single-item arrays", () => {
    expect(seededShuffle([], "x")).toEqual([]);
    expect(seededShuffle([7], "x")).toEqual([7]);
  });
  it("shuffled word-bank indices map back to the right tiles", () => {
    const tiles = ["a", "b", "c", "d"];
    const order = seededShuffle(tiles.map((_, i) => i), "ex1");
    expect(order.map((i) => tiles[i]).sort()).toEqual(tiles);
  });
});
