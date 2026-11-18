// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPlacement } from "@/lib/placement/apply";
import type { Placement } from "@/lib/placement/types";
import { EMPTY_PROGRESS, LocalStorageProgressStore, lessonStars, lessonStates } from "@/lib/progress";
import { profileStats, learnedWordIds, achievements } from "@/lib/profile";
import { EMPTY_MEMORY, seedFromCompleted } from "@/lib/review/state";
import type { CourseSummary, UnitSummary } from "@/lib/types";

const KEY = "banglalingo.progress.v1";
let store: LocalStorageProgressStore;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
  window.localStorage.clear();
  store = new LocalStorageProgressStore();
});
afterEach(() => vi.useRealTimers());

const lesson = (id: string) => ({ id, title: id, kind: "lesson" as const, exerciseCount: 10, draft: false });
const unit: UnitSummary = { id: "u1", title: "U1", track: "main", lessons: ["a", "b", "c"].map(lesson) };
const COURSE: CourseSummary = {
  id: "c",
  title: "C",
  source: "fixture",
  units: [unit, { id: "s1", title: "Script", track: "script", lessons: [lesson("s-a")] }],
};

describe("completeLessons (placement)", () => {
  it("marks lessons placed with no XP, streak, activity or daily-log change", () => {
    const before = store.get();
    const p = store.completeLessons(["a", "b"], { source: "placement" });
    expect(p.xp).toBe(0);
    expect(p.streak).toBe(0);
    expect(p.lastActiveDate).toBeNull();
    expect(p.daily).toEqual({});
    expect(p.completed.a).toMatchObject({ placed: true, bestAccuracy: 0, timesCompleted: 0 });
    expect(lessonStars(p.completed.a)).toBe(0);
    expect(before.completed).toEqual({});
    expect(store.get()).toBe(store.get()); // stable snapshot after the write
  });

  it("notifies subscribers once and writes once", () => {
    const fn = vi.fn();
    const spy = vi.spyOn(Storage.prototype, "setItem");
    store.subscribe(fn);
    store.completeLessons(["a", "b", "c"], { source: "placement" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.filter(([k]) => k === KEY)).toHaveLength(1);
    spy.mockRestore();
  });

  it("leaves already-completed lessons alone and is a no-op with nothing new", () => {
    store.completeLesson("a", 10, 1);
    const fn = vi.fn();
    store.subscribe(fn);
    const p = store.completeLessons(["a"], { source: "placement" });
    expect(p.completed.a.placed).toBeUndefined();
    expect(p.completed.a.bestAccuracy).toBe(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("unlocks the next lesson, and playing a placed lesson makes it a normal record", () => {
    store.completeLessons(["a", "b"], { source: "placement" });
    expect(lessonStates(unit, store.get())).toEqual(["completed", "completed", "unlocked"]);
    const p = store.completeLesson("a", 12, 0.96);
    expect(p.completed.a.placed).toBeUndefined();
    expect(p.completed.a).toMatchObject({ bestAccuracy: 0.96, timesCompleted: 1 });
    expect(p.xp).toBe(12);
  });

  it("round-trips through storage; old records without `placed` still load; bad `placed` is dropped", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        ...EMPTY_PROGRESS,
        completed: {
          old: { completedAt: "2026-01-01T00:00:00Z", bestAccuracy: 0.9, timesCompleted: 2 },
          bad: { completedAt: "2026-01-01T00:00:00Z", bestAccuracy: 0.9, timesCompleted: 1, placed: "yes" },
          junk: null,
          pl: { completedAt: "2026-01-01T00:00:00Z", bestAccuracy: 0.9, timesCompleted: 5, placed: true },
        },
      }),
    );
    const c = new LocalStorageProgressStore().get().completed;
    expect(c.old).toEqual({ completedAt: "2026-01-01T00:00:00Z", bestAccuracy: 0.9, timesCompleted: 2 });
    expect(c.bad.placed).toBeUndefined();
    expect(c.junk).toBeUndefined();
    expect(c.pl).toMatchObject({ placed: true, bestAccuracy: 0, timesCompleted: 0 });
  });

  it("applyPlacement uses the bulk call and returns the number newly marked", () => {
    store.completeLesson("a", 5, 1);
    const n = applyPlacement(store, { completeLessonIds: ["a", "b", "c"] } as Placement);
    expect(n).toBe(2);
    const p = store.get();
    expect(p.xp).toBe(5);
    expect(p.completed.b.placed).toBe(true);
    expect(p.completed.a.placed).toBeUndefined();
  });
});

describe("placed lessons and word memory", () => {
  const vocab = { a: ["w1"], b: ["w2"] };
  it("seedFromCompleted skips placed lessons but seeds played ones", () => {
    const completed = {
      a: { completedAt: "2026-03-01T00:00:00Z", bestAccuracy: 0, timesCompleted: 0, placed: true as const },
      b: { completedAt: "2026-03-01T00:00:00Z", bestAccuracy: 1, timesCompleted: 1 },
    };
    const m = seedFromCompleted(EMPTY_MEMORY, completed, vocab);
    expect(Object.keys(m.words)).toEqual(["w2"]);
    expect(seedFromCompleted(EMPTY_MEMORY, { a: completed.a }, vocab)).toBe(EMPTY_MEMORY);
  });
  it("profile's learned words ignore placed lessons", () => {
    const words = [{ id: "w1", lesson: "a" }, { id: "w2", lesson: "b" }];
    const completed = {
      a: { completedAt: "x", bestAccuracy: 0, timesCompleted: 0, placed: true as const },
      b: { completedAt: "x", bestAccuracy: 1, timesCompleted: 1 },
    };
    expect(learnedWordIds(words, EMPTY_MEMORY, completed)).toEqual(["w2"]);
  });
});

describe("profile stats and placed lessons", () => {
  it("counts them as lessons done but not as effort", () => {
    const p = store.completeLessons(["a", "b", "c", "s-a"], { source: "placement" });
    const s = profileStats({ progress: p, memory: EMPTY_MEMORY, words: [], course: COURSE, today: "2026-03-10", now: Date.now() });
    expect(s.lessonsCompleted).toBe(4);
    expect(s.lessonsPlayed).toBe(0);
    expect(s.daysActive).toBe(0);
    expect(s.perfectLessons).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.wordsLearned).toBe(0);
    expect(s.units.find((u) => u.id === "u1")?.done).toBe(3); // shown on the unit list
    expect(s.unitsFinished).toBe(0);
    expect(s.scriptComplete).toBe(false);
    const earned = achievements(s).filter((a) => a.earned).map((a) => a.id);
    expect(earned).toEqual([]);
  });

  it("a played lesson on top of placement is counted normally", () => {
    store.completeLessons(["a", "b"], { source: "placement" });
    const p = store.completeLesson("c", 10, 1);
    const s = profileStats({ progress: p, memory: EMPTY_MEMORY, words: [], course: COURSE, today: "2026-03-10", now: Date.now() });
    expect(s.lessonsPlayed).toBe(1);
    expect(s.daysActive).toBe(1);
    expect(s.perfectLessons).toBe(1);
    expect(s.unitsFinished).toBe(0); // only 1 of 3 played
  });
});
