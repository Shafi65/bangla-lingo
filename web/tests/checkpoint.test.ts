// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canTestOut,
  checkpointIds,
  checkpointSpan,
  firstTryNeeded,
  nextCheckpointId,
  testOutInfo,
  testOutOffer,
  testOutPassed,
} from "@/lib/checkpoint";
import { getCourse } from "@/lib/content";
import { achievements, profileStats } from "@/lib/profile";
import { LocalStorageProgressStore, isTestedOut, lessonStars, skipSource } from "@/lib/progress";
import { EMPTY_MEMORY, seedFromCompleted } from "@/lib/review/state";
import type { CourseSummary, LessonKind, UnitSummary } from "@/lib/types";

const lesson = (id: string, kind: LessonKind = "lesson") => ({ id, title: id, kind, exerciseCount: 10, draft: false });
const unit = (id: string, ids: string[], track: "main" | "script" = "main", cp?: string): UnitSummary => ({
  id,
  title: id,
  track,
  lessons: ids.map((i) => lesson(i, i === cp ? "checkpoint" : "lesson")),
});
const COURSE: CourseSummary = {
  id: "c",
  title: "C",
  source: "fixture",
  units: [
    unit("u1", ["a1", "a2"]),
    unit("s1", ["s-a", "s-b"], "script"),
    unit("u2", ["b1", "b2"]),
    unit("u3", ["c1", "c2", "c-cp"], "main", "c-cp"),
    unit("s2", ["s-c"], "script", "s-c"), // a "checkpoint" in the script track is ignored
    unit("u4", ["d1", "d-cp"], "main", "d-cp"),
    unit("u5", ["e1"]),
  ],
};

describe("checkpoint coverage", () => {
  it("covers main-track lessons from the course start up to and including the first checkpoint", () => {
    expect(checkpointSpan(COURSE, "c-cp")?.lessonIds).toEqual(["a1", "a2", "b1", "b2", "c1", "c2", "c-cp"]);
    expect(checkpointSpan(COURSE, "c-cp")?.label).toBe("Units 1–3");
  });
  it("covers only what lies after the previous checkpoint, and never the script track", () => {
    const span = checkpointSpan(COURSE, "d-cp");
    expect(span?.lessonIds).toEqual(["d1", "d-cp"]);
    expect(span?.label).toBe("Unit 4");
    expect(span?.lessonIds.some((id) => id.startsWith("s-"))).toBe(false);
  });
  it("is undefined for ordinary lessons, unknown ids and script lessons", () => {
    expect(checkpointSpan(COURSE, "a1")).toBeUndefined();
    expect(checkpointSpan(COURSE, "nope")).toBeUndefined();
    expect(checkpointSpan(COURSE, "s-c")).toBeUndefined();
    expect(testOutInfo(COURSE, "a1")).toBeUndefined();
    expect(checkpointIds(COURSE)).toEqual(["c-cp", "d-cp"]);
    expect(testOutInfo(COURSE, "d-cp")).toEqual({ label: "Unit 4", covered: ["d1", "d-cp"], order: ["c-cp", "d-cp"] });
  });
  it("matches the real course: u03-c01, u06-c01, u09-c01, u12-c01 partition the main track", () => {
    const course = getCourse();
    const cps = ["u03-c01", "u06-c01", "u09-c01", "u12-c01"];
    expect(checkpointIds(course).slice(0, 4)).toEqual(cps);
    const main = course.units.filter((u) => u.track !== "script");
    const spans = cps.map((id) => checkpointSpan(course, id)!);
    expect(spans[0].lessonIds[0]).toBe(main[0].lessons[0].id);
    expect(spans.map((s) => s.label)).toEqual(["Units 1–3", "Units 4–6", "Units 7–9", "Units 10–12"]);
    const all = spans.flatMap((s) => s.lessonIds);
    expect(new Set(all).size).toBe(all.length); // no overlap
    for (const s of spans) {
      expect(s.lessonIds.at(-1)).toBe(s.id);
      expect(s.lessonIds.some((id) => /^s\d/.test(id))).toBe(false);
    }
    expect(spans[1].lessonIds).toContain("u04-l01");
    expect(spans[1].lessonIds).not.toContain("u03-c01");
  });
});

describe("checkpoints are scoped by level", () => {
  const rec = { completedAt: "x", bestAccuracy: 1, timesCompleted: 1 };
  const inter = (id: string, ids: string[], cp?: string): UnitSummary => ({ ...unit(id, ids, "main", cp), level: "intermediate" });
  const MIXED: CourseSummary = {
    id: "m",
    title: "M",
    source: "fixture",
    units: [
      unit("u1", ["a1", "a-cp"], "main", "a-cp"),
      unit("u2", ["b1", "b2"]),
      inter("i1", ["i1a", "i1-cp"], "i1-cp"),
      inter("i2", ["i2a", "i2-cp"], "i2-cp"),
    ],
  };
  it("an intermediate checkpoint never covers beginner lessons", () => {
    expect(checkpointSpan(MIXED, "i1-cp")?.lessonIds).toEqual(["i1a", "i1-cp"]);
    expect(checkpointSpan(MIXED, "i1-cp")?.label).toBe("Intermediate Unit 1");
  });
  it("a later intermediate checkpoint starts after the previous intermediate one", () => {
    expect(checkpointSpan(MIXED, "i2-cp")?.lessonIds).toEqual(["i2a", "i2-cp"]);
  });
  it("a beginner checkpoint stops at its own level, and unfinished beginner lessons after it are not covered", () => {
    expect(checkpointSpan(MIXED, "a-cp")?.lessonIds).toEqual(["a1", "a-cp"]);
  });
  it("a beginner with an open beginner checkpoint is not offered the intermediate one", () => {
    expect(testOutOffer(MIXED, {})?.id).toBe("a-cp");
    expect(canTestOut(checkpointIds(MIXED), {}, "i1-cp")).toBe(false);
    const done = { a1: rec, "a-cp": rec };
    expect(testOutOffer(MIXED, done)?.id).toBe("i1-cp");
    expect(testOutOffer(MIXED, done)?.remaining).toBe(2);
  });
  it("the real course: i01-c01 covers only intermediate lessons", () => {
    const span = checkpointSpan(getCourse(), "i01-c01")!;
    expect(span.lessonIds.every((id) => id.startsWith("i01-"))).toBe(true);
    expect(span.lessonIds.at(-1)).toBe("i01-c01");
    expect(span.label).toBe("Intermediate Unit 1");
  });
});

describe("which checkpoint may be tested out", () => {
  const rec = { completedAt: "x", bestAccuracy: 1, timesCompleted: 1 };
  it("only the next checkpoint ahead", () => {
    const order = checkpointIds(COURSE);
    expect(nextCheckpointId(order, {})).toBe("c-cp");
    expect(canTestOut(order, {}, "c-cp")).toBe(true);
    expect(canTestOut(order, {}, "d-cp")).toBe(false);
    expect(canTestOut(order, { "c-cp": rec }, "d-cp")).toBe(true);
    expect(canTestOut(order, { "c-cp": rec }, "c-cp")).toBe(false);
    expect(nextCheckpointId(order, { "c-cp": rec, "d-cp": rec })).toBeUndefined();
  });
  it("is offered on the map while something it covers is unfinished", () => {
    expect(testOutOffer(COURSE, {})).toEqual({ id: "c-cp", label: "Units 1–3", remaining: 7 });
    const nearly = Object.fromEntries(["a1", "a2", "b1", "b2", "c1", "c2"].map((id) => [id, rec]));
    expect(testOutOffer(COURSE, nearly)).toBeUndefined(); // only the checkpoint is left: just play it
    expect(testOutOffer(COURSE, { ...nearly, "c-cp": rec })?.id).toBe("d-cp");
  });
});

describe("test-out pass rule", () => {
  it("needs a heart left and 80% first-try", () => {
    expect(testOutPassed({ heartsLeft: 5, firstTry: 20, total: 20 })).toBe(true);
    expect(testOutPassed({ heartsLeft: 1, firstTry: 16, total: 20 })).toBe(true); // exactly 80%
    expect(testOutPassed({ heartsLeft: 3, firstTry: 15, total: 20 })).toBe(false);
    expect(testOutPassed({ heartsLeft: 0, firstTry: 20, total: 20 })).toBe(false);
    expect(testOutPassed({ heartsLeft: 2, firstTry: 0, total: 0 })).toBe(false);
    expect(testOutPassed({ heartsLeft: 2, firstTry: 4, total: 5 })).toBe(true);
    expect(testOutPassed({ heartsLeft: 2, firstTry: 8, total: 10 })).toBe(true);
    expect(testOutPassed({ heartsLeft: 2, firstTry: 7, total: 10 })).toBe(false);
  });
  it("firstTryNeeded", () => {
    expect(firstTryNeeded(20)).toBe(16);
    expect(firstTryNeeded(15)).toBe(12);
    expect(firstTryNeeded(7)).toBe(6);
  });
});

describe("completeLessons with source checkpoint", () => {
  const KEY = "banglalingo.progress.v1";
  let store: LocalStorageProgressStore;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    window.localStorage.clear();
    store = new LocalStorageProgressStore();
  });
  afterEach(() => vi.useRealTimers());

  const ids = ["a1", "a2", "b1", "b2", "c1", "c2", "c-cp"];

  it("marks lessons tested out with no XP, streak, activity, stars or seeding", () => {
    const p = store.completeLessons(ids, { source: "checkpoint" });
    expect(p.xp).toBe(0);
    expect(p.streak).toBe(0);
    expect(p.lastActiveDate).toBeNull();
    expect(p.daily).toEqual({});
    expect(p.completed.a1).toMatchObject({ placed: true, via: "checkpoint", bestAccuracy: 0, timesCompleted: 0 });
    expect(isTestedOut(p.completed.a1)).toBe(true);
    expect(skipSource(p.completed.a1)).toBe("checkpoint");
    expect(lessonStars(p.completed.a1)).toBe(0);
    expect(seedFromCompleted(EMPTY_MEMORY, p.completed, { a1: ["w1"] })).toBe(EMPTY_MEMORY);
  });

  it("writes once, notifies once, and leaves played lessons alone", () => {
    store.completeLesson("a1", 12, 1);
    const fn = vi.fn();
    const spy = vi.spyOn(Storage.prototype, "setItem");
    store.subscribe(fn);
    const before = spy.mock.calls.filter(([k]) => k === KEY).length;
    const p = store.completeLessons(ids, { source: "checkpoint" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.filter(([k]) => k === KEY).length - before).toBe(1);
    spy.mockRestore();
    expect(p.completed.a1.placed).toBeUndefined();
    expect(p.completed.a1.via).toBeUndefined();
    expect(p.xp).toBe(12);
    expect(Object.keys(p.completed)).toHaveLength(ids.length);
  });

  it("keeps placement records as Placed and does not relabel them", () => {
    store.completeLessons(["a1"], { source: "placement" });
    const p = store.completeLessons(ids, { source: "checkpoint" });
    expect(skipSource(p.completed.a1)).toBe("placement");
    expect(skipSource(p.completed.a2)).toBe("checkpoint");
  });

  it("survives a reload, and playing the lesson afterwards makes it a normal record", () => {
    store.completeLessons(ids, { source: "checkpoint" });
    const again = new LocalStorageProgressStore();
    expect(skipSource(again.get().completed.b1)).toBe("checkpoint");
    const p = again.completeLesson("b1", 10, 0.9);
    expect(p.completed.b1.placed).toBeUndefined();
    expect(p.completed.b1.via).toBeUndefined();
  });

  it("ignores `via` on records that are not placed, and unknown values", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        xp: 0,
        streak: 0,
        lastActiveDate: null,
        daily: {},
        completed: {
          p: { completedAt: "x", bestAccuracy: 1, timesCompleted: 1, via: "checkpoint" },
          q: { completedAt: "x", bestAccuracy: 0, timesCompleted: 0, placed: true, via: "bogus" },
        },
      }),
    );
    const c = new LocalStorageProgressStore().get().completed;
    expect(c.p.via).toBeUndefined();
    expect(skipSource(c.q)).toBe("placement");
  });

  it("an unknown source changes nothing", () => {
    const p = store.completeLessons(ids, { source: "bogus" as never });
    expect(p.completed).toEqual({});
  });

  it("profile and achievements do not count tested-out lessons as effort", () => {
    const p = store.completeLessons([...ids, "d1", "d-cp"], { source: "checkpoint" });
    const s = profileStats({ progress: p, memory: EMPTY_MEMORY, words: [], course: COURSE, today: "2026-03-10", now: Date.now() });
    expect(s.lessonsCompleted).toBe(9);
    expect(s.lessonsPlayed).toBe(0);
    expect(s.daysActive).toBe(0);
    expect(s.perfectLessons).toBe(0);
    expect(s.wordsLearned).toBe(0);
    expect(s.unitsFinished).toBe(0);
    expect(achievements(s).filter((a) => a.earned)).toEqual([]);
  });
});
