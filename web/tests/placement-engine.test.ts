import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  answerCurrent,
  blockFor,
  createSession,
  currentItem,
  finalBandFor,
  firstStage,
  levelFromBands,
  matchesRule,
  pickItems,
  placeLearner,
  progressOf,
  rng,
  stopSession,
  unitBands,
  unitLabel,
} from "@/lib/placement/engine";
import type { AnswerRecord, Background, ItemBank, PlacementConfig, PlacementUnit, SessionState } from "@/lib/placement/types";

const dir = path.resolve(import.meta.dirname, "..", "..", "content", "placement");
const bank = JSON.parse(fs.readFileSync(path.join(dir, "items.json"), "utf8")) as ItemBank;
const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")) as PlacementConfig;

const L = (id: string, n = 2) => Array.from({ length: n }, (_, i) => `${id}-l${i + 1}`);
const units: PlacementUnit[] = [
  { id: "u01-basics", title: "Basics", track: "main", level: "beginner", lessons: L("u01") },
  { id: "s01-vowels", title: "Script: Vowels", track: "script", level: "beginner", lessons: L("s01") },
  { id: "u02-pronouns", title: "People", track: "main", level: "beginner", lessons: L("u02") },
  { id: "u06-bazaar", title: "At the bazaar", track: "main", level: "beginner", lessons: L("u06") },
  { id: "s04-conjuncts", title: "Script: Conjuncts", track: "script", level: "beginner", lessons: L("s04") },
  { id: "u07-directions", title: "Directions", track: "main", level: "beginner", lessons: L("u07") },
  { id: "u11-plans", title: "Plans", track: "main", level: "beginner", lessons: L("u11") },
  { id: "u12-new", title: "Next", track: "main", level: "beginner", lessons: L("u12") },
  { id: "i01-catching-up", title: "Catching up", track: "main", level: "intermediate", lessons: L("i01") },
];

const READER: Background = { homeUse: "sometimes", readScript: "yes" };

/** Run a session to the end, answering with `decide(item)`. */
function run(bg: Background, decide: (s: SessionState) => boolean, seed = 1): SessionState {
  let s = createSession(bank, cfg, bg, seed);
  for (let guard = 0; s.stage !== "done" && guard < 100; guard++) s = answerCurrent(s, bank, cfg, decide(s));
  return s;
}
const itemOf = (s: SessionState) => currentItem(s, bank)!;

describe("background rules", () => {
  it("starts with the script check only when the learner can't read yet", () => {
    expect(firstStage({ readScript: "no" }, cfg)).toBe("script");
    expect(firstStage({ readScript: "some" }, cfg)).toBe("script");
    expect(firstStage({ readScript: "slowly" }, cfg)).toBe("routing");
    expect(firstStage({}, cfg)).toBe("routing");
  });
  it("matches all named questions", () => {
    expect(matchesRule({ homeUse: "daily", readScript: "no" }, cfg.background.heritageWhen)).toBe(true);
    expect(matchesRule({ homeUse: "daily", readScript: "yes" }, cfg.background.heritageWhen)).toBe(false);
    expect(matchesRule({ readScript: "no" }, cfg.background.heritageWhen)).toBe(false);
  });
  it("never changes the score: same answers, different background, same groups", () => {
    const s = run(READER, () => true);
    const a = placeLearner(s, READER, units, cfg);
    const b = placeLearner(s, { homeUse: "daily", homeVariety: "sylheti", readScript: "yes" }, units, cfg);
    expect(b.groups).toEqual(a.groups);
    expect(b.notes.length).toBeGreaterThan(a.notes.length); // only an explanatory note is added
  });
});

describe("cut scores", () => {
  it("routes the 7-item routing block 0–2 / 3–5 / 6–7", () => {
    expect([0, 1, 2].map((n) => blockFor(n, cfg))).toEqual(["A", "A", "A"]);
    expect([3, 4, 5].map((n) => blockFor(n, cfg))).toEqual(["B", "B", "B"]);
    expect([6, 7].map((n) => blockFor(n, cfg))).toEqual(["C", "C"]);
  });
  it("chooses the final band from the routing + block total", () => {
    expect(finalBandFor("A", 8, cfg)).toBe("A1");
    expect(finalBandFor("A", 9, cfg)).toBe("A2a");
    expect(finalBandFor("B", 6, cfg)).toBe("A1");
    expect(finalBandFor("B", 7, cfg)).toBe("A2a");
    expect(finalBandFor("B", 11, cfg)).toBe("A2a");
    expect(finalBandFor("B", 12, cfg)).toBe("A2b");
    expect(finalBandFor("C", 10, cfg)).toBe("A2a");
    expect(finalBandFor("C", 13, cfg)).toBe("A2b");
    expect(finalBandFor("C", 14, cfg)).toBe("B1");
  });
  it("passes a band with at least 2 items and ≥ 66% right", () => {
    expect(levelFromBands({ A1: { correct: 2, total: 3 } }, cfg)).toBe("A1");
    expect(levelFromBands({ A1: { correct: 1, total: 1 } }, cfg)).toBeNull();
    expect(levelFromBands({ A1: { correct: 1, total: 3 } }, cfg)).toBeNull();
    expect(levelFromBands({ A1: { correct: 3, total: 4 }, A2a: { correct: 2, total: 3 }, A2b: { correct: 1, total: 4 } }, cfg)).toBe("A2a");
  });
});

describe("item picking", () => {
  it("is deterministic for a seed and never repeats an item", () => {
    const a = run(READER, (s) => itemOf(s).band !== "B1", 42);
    const b = run(READER, (s) => itemOf(s).band !== "B1", 42);
    expect(a.used).toEqual(b.used);
    expect(new Set(a.used).size).toBe(a.used.length);
  });
  it("different seeds give different tests", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) seen.add(createSession(bank, cfg, READER, seed).queue.join(","));
    expect(seen.size).toBeGreaterThan(1);
  });
  it("respects slot band, group and skill", () => {
    const { ids, fallbacks } = pickItems(bank, cfg, cfg.stages.routing.slots, "A1", new Set(), rng(3));
    expect(fallbacks).toBe(0);
    ids.forEach((id, n) => {
      const it = bank.items.find((i) => i.id === id)!;
      const slot = cfg.stages.routing.slots[n];
      expect(it.band).toBe(slot.band);
      expect(cfg.skills[it.skill]).toBe(slot.group);
      if (slot.skill) expect(it.skill).toBe(slot.skill);
    });
  });
  it("borrows from the nearest band when a band runs out", () => {
    const thin: ItemBank = { version: 1, items: bank.items.filter((i) => !(i.band === "B1" && i.skill === "listening")) };
    const { ids, fallbacks } = pickItems(thin, cfg, [{ group: "listening" }], "B1", new Set(), rng(1));
    expect(fallbacks).toBe(1);
    expect(thin.items.find((i) => i.id === ids[0])!.band).toBe("A2b");
  });
});

describe("routing and early stop", () => {
  it("all wrong stops after the routing block and places at Unit 1", () => {
    const s = run(READER, () => false);
    expect(s.stopReason).toBe("early-bottom");
    expect(s.answers).toHaveLength(7);
    const p = placeLearner(s, READER, units, cfg);
    expect(p.route).toBe("start");
    expect(p.startLessonId).toBe("u01-l1");
    expect(p.completeLessonIds).toEqual([]);
  });
  it("one listening item right keeps the test going (heritage learners)", () => {
    let first = true;
    const s = run(READER, (st) => {
      if (first && itemOf(st).skill === "listening") {
        first = false;
        return true;
      }
      return false;
    });
    expect(s.stopReason).toBe("complete");
    expect(s.block).toBe("A");
  });
  it("all right ends at the top after 16 items and places in the intermediate track", () => {
    const s = run(READER, () => true);
    expect(s.stopReason).toBe("early-top");
    expect(s.answers).toHaveLength(16);
    expect(s.block).toBe("C");
    const p = placeLearner(s, READER, units, cfg);
    expect(p.route).toBe("intermediate");
    expect(p.kind).toBe("intermediate");
    expect(p.startLessonId).toBe("i01-l1");
    expect(p.startLabel).toBe("Intermediate Unit 1: Catching up");
    // everything before i01, script track included
    expect(p.completeLessonIds).toEqual(units.slice(0, 8).flatMap((u) => u.lessons));
  });
  it("a full path is 25 items (7 + 9 + 9), plus 3 when the script check runs", () => {
    // Right on routing + A1/A2a items only: B, then a final stage.
    const s = run(READER, (st) => ["A1", "A2a"].includes(itemOf(st).band));
    expect(s.stopReason).toBe("complete");
    expect(s.answers).toHaveLength(25);
    const t = run({ readScript: "no" }, (st) => ["A0", "A1", "A2a"].includes(itemOf(st).band));
    expect(t.answers).toHaveLength(28);
    expect(t.answers.slice(0, 3).every((a) => a.stage === "script" && a.band === "A0")).toBe(true);
  });
  it("progress shrinks the expected total when the test stops early", () => {
    const s = createSession(bank, cfg, READER, 1);
    expect(progressOf(s, cfg)).toEqual({ answered: 0, expected: 25 });
    const stopped = stopSession(answerCurrent(s, bank, cfg, true));
    expect(stopped.stopReason).toBe("user");
    expect(progressOf(stopped, cfg)).toEqual({ answered: 1, expected: 1 });
  });
});

describe("placement mapping", () => {
  const rec = (group: AnswerRecord["group"], band: AnswerRecord["band"], correct: number, total: number): AnswerRecord[] =>
    Array.from({ length: total }, (_, i) => ({
      itemId: `${group}-${band}-${i}`,
      band,
      skill: group === "reading" ? "reading-script" : group,
      group,
      stage: "block",
      correct: i < correct,
    }));
  const place = (answers: AnswerRecord[], bg: Background = READER) =>
    placeLearner({ answers, stopReason: "complete" }, bg, units, cfg);

  it("bands units by position, script units A0, intermediate B1 (new units join their band)", () => {
    const b = unitBands(units, cfg);
    expect(b.get("u02-pronouns")).toBe("A1");
    expect(b.get("u07-directions")).toBe("A2a");
    expect(b.get("u12-new")).toBe("A2b");
    expect(b.get("s04-conjuncts")).toBe("A0");
    expect(b.get("i01-catching-up")).toBe("B1");
    expect(unitLabel(units, "u06-bazaar")).toBe("Unit 3: At the bazaar");
  });
  it("standard: start after min(reading, grammar); script lessons marked when reading is shown", () => {
    const p = place([...rec("reading", "A1", 3, 3), ...rec("grammar", "A1", 3, 3), ...rec("grammar", "A2a", 3, 3)]);
    expect(p.route).toBe("standard");
    expect(p.startUnitId).toBe("u06-bazaar");
    expect(p.completeLessonIds).toEqual(["u01-l1", "u01-l2", "s01-l1", "s01-l2", "u02-l1", "u02-l2"]);
  });
  it("reading A2a + grammar A2b goes to the intermediate track", () => {
    const p = place([...rec("reading", "A2a", 2, 3), ...rec("grammar", "A2b", 3, 3)]);
    expect(p.route).toBe("intermediate");
  });
  it("reading and grammar at A2a start at Unit 11's band", () => {
    const p = place([...rec("reading", "A2a", 3, 3), ...rec("grammar", "A2a", 3, 3)]);
    expect(p.startUnitId).toBe("u11-plans");
  });
  it("heritage fast lane: strong listening, no reading -> alphabet, easier main units done, script open", () => {
    const p = place([...rec("listening", "A2a", 3, 3), ...rec("reading", "A1", 0, 3), ...rec("grammar", "A1", 0, 3)], {
      homeUse: "daily",
      readScript: "no",
    });
    expect(p.route).toBe("fast-lane");
    expect(p.startLessonId).toBe("s01-l1");
    expect(p.heritage).toBe(true);
    expect(p.completeLessonIds).toEqual(["u01-l1", "u01-l2", "u02-l1", "u02-l2"]);
    expect(p.completeLessonIds.some((id) => id.startsWith("s"))).toBe(false);
  });
  it("nothing passed + can't read the script -> alphabet; script check passed -> Unit 1", () => {
    expect(place(rec("grammar", "A1", 0, 3), { readScript: "no" }).route).toBe("alphabet");
    const p = place([...rec("reading", "A0", 3, 3), ...rec("grammar", "A1", 0, 3)], { readScript: "no" });
    expect(p.route).toBe("start");
    expect(p.startLessonId).toBe("u01-l1");
  });
  it("a stopped test says it is partial", () => {
    const p = placeLearner({ answers: rec("grammar", "A1", 1, 2), stopReason: "user" }, READER, units, cfg);
    expect(p.partial).toBe(true);
    expect(p.notes.join(" ")).toMatch(/stopped early/);
  });
});
