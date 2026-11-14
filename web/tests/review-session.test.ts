import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY,
  MAX_ITEMS,
  MAX_PENDING,
  MAX_WORDS,
  MIN_ITEMS,
  applyGrades,
  buildSession,
  clashes,
  dueIds,
  mistakeIds,
  mulberry32,
  parseMemory,
  schedule,
  type ReviewWord,
  type WordMemoryState,
} from "@/lib/review";
import { reviewWordId } from "@/lib/review/targets";
import type { Exercise } from "@/lib/types";

const NOW = Date.UTC(2026, 2, 10, 12);
const DAY = 86_400_000;

const NAMES = [
  "water", "rice", "fish", "tea", "milk", "bread", "salt", "sugar", "egg", "fruit",
  "mango", "banana", "house", "road", "river", "tree", "book", "pen", "chair", "table",
  "mother", "father", "sister", "brother", "friend", "teacher", "doctor", "market", "school", "village",
];
const word = (i: number, over: Partial<ReviewWord> = {}): ReviewWord => ({
  id: `w${i}`,
  bn: `বাংলা${"ক".repeat(i + 1)}`,
  tr: `bangla${"k".repeat(i + 1)}`,
  en: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ""),
  lesson: `u0${1 + (i % 3)}-l01`,
  lessonTitle: "L",
  unit: `u0${1 + (i % 3)}`,
  unitTitle: "U",
  letter: false,
  ...over,
});
const base = Array.from({ length: 30 }, (_, i) => word(i));
// Deliberate look-alikes of w0: same meaning, same transliteration, same Bengali.
const clashers: ReviewWord[] = [
  word(40, { id: "same-en", en: "Water (cold)" }),
  word(41, { id: "same-tr", tr: base[0].tr, en: "liquid" }),
  word(42, { id: "same-bn", bn: base[0].bn, tr: "other", en: "fluid" }),
];
const words = [...base, ...clashers];
const learned = new Set(words.map((w) => w.id));

function dueMemory(ids: string[]): WordMemoryState {
  let m: WordMemoryState = EMPTY_MEMORY;
  for (const id of ids) m = applyGrades(m, [{ id, grade: "good" }], NOW - 5 * DAY);
  return m;
}

const optionField = (ex: Exercise): "en" | "bn" | "tr" | undefined => {
  if (ex.type === "select_translation") return ex.direction === "bn_to_en" ? "en" : "bn";
  if (ex.type === "listen_select") return "bn";
  if (ex.type === "script_recognize") return "tr";
  return undefined;
};

describe("buildSession", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: 10-15 items, one correct option, no duplicates, distinct distractors`, () => {
      const memory = dueMemory(base.slice(0, 14).map((w) => w.id));
      const { lesson, wordIds } = buildSession({
        words, memory, learned, mode: "due", now: NOW, rand: mulberry32(seed),
      });
      expect(lesson.exercises.length).toBeGreaterThanOrEqual(MIN_ITEMS);
      expect(lesson.exercises.length).toBeLessThanOrEqual(MAX_ITEMS);
      expect(wordIds.length).toBeGreaterThan(0);
      const ids = lesson.exercises.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const ex of lesson.exercises) {
        const target = words.find((w) => w.id === reviewWordId(ex.id))!;
        expect(target, ex.id).toBeDefined();
        const field = optionField(ex);
        if (!field) {
          expect(ex.type).toBe("type_translation");
          continue;
        }
        const options = (ex as { options: string[] }).options;
        const answer = (ex as { answer: number }).answer;
        expect(options.length).toBeGreaterThanOrEqual(3);
        expect(new Set(options).size).toBe(options.length);
        expect(options[answer]).toBe(target[field]);
        // Exactly one option is the target's value; every other option belongs to a
        // word that differs from the target in Bengali, transliteration and meaning.
        expect(options.filter((o) => o === target[field])).toHaveLength(1);
        options.forEach((o, i) => {
          if (i === answer) return;
          const owners = words.filter((w) => w[field] === o);
          expect(owners.length, `option ${o}`).toBeGreaterThan(0);
          for (const w of owners) {
            expect(clashes(w, target), `${w.id} vs ${target.id}`).toBe(false);
            expect(w.bn).not.toBe(target.bn);
            expect(w.tr).not.toBe(target.tr);
          }
        });
      }
    });
  }

  it("never offers the look-alike words as distractors for their twin", () => {
    const memory = dueMemory(["w0"]);
    for (let seed = 1; seed <= 20; seed++) {
      const { lesson } = buildSession({ words, memory, learned, mode: "due", now: NOW, rand: mulberry32(seed) });
      for (const ex of lesson.exercises) {
        if (reviewWordId(ex.id) !== "w0" || ex.type === "type_translation") continue;
        const opts = (ex as { options: string[] }).options.join("|");
        expect(opts).not.toMatch(/Water \(cold\)|liquid|fluid|other/);
      }
    }
  });

  it("tops up a small pool of due words to at least 10 items", () => {
    const memory = dueMemory(["w0", "w1", "w2"]);
    const { lesson } = buildSession({ words, memory, learned, mode: "due", now: NOW, rand: mulberry32(9) });
    expect(lesson.exercises.length).toBeGreaterThanOrEqual(MIN_ITEMS);
  });

  it("mistakes mode practises the given ids", () => {
    const { wordIds } = buildSession({
      words, memory: EMPTY_MEMORY, learned, mode: "mistakes", now: NOW, rand: mulberry32(1), ids: ["w3", "w4", "nope"],
    });
    expect(wordIds).toEqual(["w3", "w4"]);
  });

  it("is deterministic for a given seed", () => {
    const memory = dueMemory(base.slice(0, 12).map((w) => w.id));
    const run = () => buildSession({ words, memory, learned, mode: "due", now: NOW, rand: mulberry32(7) }).lesson;
    expect(run()).toEqual(run());
  });
});

describe("word memory state parsing", () => {
  it("junk becomes the empty state", () => {
    for (const junk of [null, undefined, 42, "", "not json", "[]", "{}", '{"version":2}', { version: 1, words: 5 }, true]) {
      const s = parseMemory(junk);
      if (junk && typeof junk === "object" && (junk as { version?: number }).version === 1) {
        expect(s).toEqual({ version: 1, words: {}, pending: [] });
      } else {
        expect(s).toBe(EMPTY_MEMORY);
      }
    }
  });

  it("drops unusable records and pending events but keeps good ones", () => {
    const good = schedule(undefined, "good", NOW, "ok");
    const s = parseMemory({
      version: 1,
      words: { ok: good, bad: { stability: "x" }, worse: null, nan: { ...good, stability: NaN } },
      pending: [
        { l: "a", x: { id: "e" }, ok: true, t: 1 },
        { l: 5, x: {}, ok: true, t: 1 },
        { l: "a", x: null, ok: true, t: 1 },
        "junk",
      ],
    });
    expect(Object.keys(s.words)).toEqual(["ok"]);
    expect(s.pending).toHaveLength(1);
  });

  it("clamps out-of-range numbers in stored records", () => {
    const s = parseMemory({
      version: 1,
      words: { a: { stability: 1e9, difficulty: 99, due: 1, lastSeen: 1, reps: -3, lapses: 2.7, run: -1 } },
      pending: [],
    });
    expect(s.words.a.stability).toBeLessThanOrEqual(365 * 3);
    expect(s.words.a.difficulty).toBe(10);
    expect(s.words.a.reps).toBe(0);
    expect(s.words.a.lapses).toBe(2);
    expect(s.words.a.run).toBe(0);
  });

  it("parses its own JSON round trip", () => {
    const m = applyGrades(EMPTY_MEMORY, [{ id: "a", grade: "good" }, { id: "b", grade: "again" }], NOW);
    expect(parseMemory(JSON.stringify(m))).toEqual(m);
  });

  it("enforces the word cap, keeping the most recently seen", () => {
    const rec = schedule(undefined, "good", NOW, "x");
    const wordsObj: Record<string, unknown> = {};
    for (let i = 0; i < MAX_WORDS + 50; i++) wordsObj[`w${i}`] = { ...rec, lastSeen: i, due: i };
    const s = parseMemory({ version: 1, words: wordsObj, pending: [] });
    expect(Object.keys(s.words)).toHaveLength(MAX_WORDS);
    expect(s.words[`w${MAX_WORDS + 49}`]).toBeDefined();
    expect(s.words.w0).toBeUndefined();
  });

  it("enforces the pending cap, keeping the newest events", () => {
    const pending = Array.from({ length: MAX_PENDING + 20 }, (_, i) => ({ l: "l", x: { id: `e${i}` }, ok: true, t: i }));
    const s = parseMemory({ version: 1, words: {}, pending });
    expect(s.pending).toHaveLength(MAX_PENDING);
    expect(s.pending[0].t).toBe(20);
    expect(s.pending[MAX_PENDING - 1].t).toBe(MAX_PENDING + 19);
  });

  it("applyGrades keeps the cap", () => {
    const grades = Array.from({ length: MAX_WORDS + 10 }, (_, i) => ({ id: `w${i}`, grade: "good" as const }));
    expect(Object.keys(applyGrades(EMPTY_MEMORY, grades, NOW).words)).toHaveLength(MAX_WORDS);
  });
});

describe("due and mistakes lists", () => {
  it("dueIds: most overdue first; a wrong answer is due in ~10 min, not before", () => {
    let m = applyGrades(EMPTY_MEMORY, [{ id: "a", grade: "good" }], NOW - 3 * DAY);
    m = applyGrades(m, [{ id: "b", grade: "good" }], NOW - 5 * DAY);
    m = applyGrades(m, [{ id: "c", grade: "again" }], NOW);
    expect(dueIds(m, NOW)).toEqual(["b", "a"]);
    expect(dueIds(m, NOW + 11 * 60_000)).toContain("c");
    expect(dueIds(m, NOW + 5 * 60_000)).not.toContain("c");
  });

  it("mistakes leave the notebook after three right answers in a row", () => {
    let m = applyGrades(EMPTY_MEMORY, [{ id: "a", grade: "again" }], NOW);
    expect(mistakeIds(m)).toEqual(["a"]);
    for (let i = 1; i <= 3; i++) m = applyGrades(m, [{ id: "a", grade: "good" }], NOW + i * 1000);
    expect(mistakeIds(m)).toEqual([]);
  });
});
