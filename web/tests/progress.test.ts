// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  EMPTY_PROGRESS,
  LocalStorageProgressStore,
  currentStreak,
  lessonStars,
  lessonStates,
  localDateKey,
  nextLessonId,
  streakStatus,
  todayXp,
} from "@/lib/progress";
import type { CourseSummary, UnitSummary } from "@/lib/types";

const KEY = "banglalingo.progress.v1";
const ORIGINAL_TZ = process.env.TZ;

/** Set the fake wall clock using local (process TZ) time. */
function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

let store: LocalStorageProgressStore;

beforeEach(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-03-10T12:00:00Z");
  window.localStorage.clear();
  store = new LocalStorageProgressStore();
});
afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("defaults", () => {
  it("starts empty with default settings", () => {
    const p = store.get();
    expect(p.xp).toBe(0);
    expect(p.streak).toBe(0);
    expect(p.lastActiveDate).toBeNull();
    expect(p.completed).toEqual({});
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.dailyGoal).toBe(20);
  });
  it("get() returns a stable snapshot while storage is unchanged", () => {
    expect(store.get()).toBe(store.get());
    store.recordPractice(5);
    expect(store.get()).toBe(store.get());
  });
});

describe("XP and lesson completion", () => {
  it("completeLesson adds XP and records the lesson", () => {
    const p = store.completeLesson("u01-l01", 15, 0.8);
    expect(p.xp).toBe(15);
    expect(p.completed["u01-l01"]).toMatchObject({ bestAccuracy: 0.8, timesCompleted: 1 });
    expect(store.get().completed["u01-l01"].completedAt).toBe("2026-03-10T12:00:00.000Z");
  });
  it("accumulates XP across lessons and keeps best accuracy / counts repeats", () => {
    store.completeLesson("a", 10, 0.9);
    store.completeLesson("a", 10, 0.5);
    const p = store.completeLesson("b", 7, 1);
    expect(p.xp).toBe(27);
    expect(p.completed.a).toMatchObject({ bestAccuracy: 0.9, timesCompleted: 2 });
    expect(p.completed.b.timesCompleted).toBe(1);
  });
  it("recordPractice adds XP but completes nothing", () => {
    const p = store.recordPractice(10);
    expect(p.xp).toBe(10);
    expect(p.completed).toEqual({});
  });
  it("persists to localStorage and survives a new store instance", () => {
    store.completeLesson("a", 12, 1);
    const again = new LocalStorageProgressStore();
    expect(again.get().xp).toBe(12);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).xp).toBe(12);
  });
  it("notifies subscribers and supports unsubscribe", () => {
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.recordPractice(1);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    store.recordPractice(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("lessonStars thresholds", () => {
    const rec = (a: number) => ({ completedAt: "", timesCompleted: 1, bestAccuracy: a });
    expect(lessonStars(undefined)).toBe(0);
    expect(lessonStars(rec(0.2))).toBe(1);
    expect(lessonStars(rec(0.75))).toBe(2);
    expect(lessonStars(rec(0.94))).toBe(2);
    expect(lessonStars(rec(0.95))).toBe(3);
    expect(lessonStars(rec(1))).toBe(3);
  });
});

describe("daily goal / today XP", () => {
  it("todayXp sums XP earned on the same local day", () => {
    store.completeLesson("a", 10, 1);
    store.recordPractice(5);
    expect(todayXp(store.get())).toBe(15);
  });
  it("todayXp resets on a new day but total XP does not", () => {
    store.recordPractice(10);
    at("2026-03-11T09:00:00Z");
    expect(todayXp(store.get())).toBe(0);
    const p = store.recordPractice(4);
    expect(todayXp(p)).toBe(4);
    expect(p.xp).toBe(14);
    expect(p.daily["2026-03-10"]).toBe(10);
  });
  it("todayXp is 0 with no stored progress without needing the clock", () => {
    expect(todayXp(EMPTY_PROGRESS)).toBe(0);
  });
  it("prunes daily entries older than ~60 days", () => {
    store.recordPractice(5);
    at("2026-06-20T12:00:00Z"); // 102 days later
    const p = store.recordPractice(3);
    expect(Object.keys(p.daily)).toEqual(["2026-06-20"]);
  });
});

describe("streak", () => {
  it("first activity starts a streak at 1", () => {
    expect(store.recordPractice(1).streak).toBe(1);
  });
  it("same day activity does not grow the streak", () => {
    store.recordPractice(1);
    store.completeLesson("a", 1, 1);
    expect(store.recordPractice(1).streak).toBe(1);
  });
  it("next day grows the streak", () => {
    store.recordPractice(1);
    at("2026-03-11T08:00:00Z");
    expect(store.recordPractice(1).streak).toBe(2);
    at("2026-03-12T23:30:00Z");
    expect(store.recordPractice(1).streak).toBe(3);
  });
  it("a gap of 2 days resets the streak to 1", () => {
    store.recordPractice(1);
    at("2026-03-11T08:00:00Z");
    store.recordPractice(1);
    at("2026-03-13T08:00:00Z");
    expect(store.recordPractice(1).streak).toBe(1);
  });
  it("clock moving backwards resets rather than corrupting the streak", () => {
    store.recordPractice(1);
    at("2026-03-11T08:00:00Z");
    store.recordPractice(1);
    at("2026-03-01T08:00:00Z");
    expect(store.recordPractice(1).streak).toBe(1);
  });
  it("streak works across month and year boundaries", () => {
    at("2026-12-31T20:00:00Z");
    store.recordPractice(1);
    at("2027-01-01T05:00:00Z");
    expect(store.recordPractice(1).streak).toBe(2);
  });
  it("currentStreak / streakStatus reflect missed days", () => {
    store.recordPractice(1);
    at("2026-03-11T08:00:00Z");
    store.recordPractice(1);
    const p = store.get();
    expect(currentStreak(p)).toBe(2);
    expect(streakStatus(p)).toBe("done");
    at("2026-03-12T08:00:00Z"); // yesterday active, nothing today
    expect(currentStreak(p)).toBe(2);
    expect(streakStatus(p)).toBe("at-risk");
    at("2026-03-13T08:00:00Z"); // missed a full day
    expect(currentStreak(p)).toBe(0);
    expect(streakStatus(p)).toBe("none");
  });
  it("accepts an explicit `today` argument", () => {
    const p = { ...EMPTY_PROGRESS, streak: 4, lastActiveDate: "2026-03-10" };
    expect(currentStreak(p, "2026-03-11")).toBe(4);
    expect(currentStreak(p, "2026-03-12")).toBe(0);
    expect(streakStatus(p, "2026-03-10")).toBe("done");
  });
  it("no activity ever -> none / 0", () => {
    expect(currentStreak(EMPTY_PROGRESS)).toBe(0);
    expect(streakStatus(EMPTY_PROGRESS)).toBe("none");
  });

  describe("timezone edge at local midnight", () => {
    it("uses the LOCAL day, not the UTC day (Asia/Dhaka, UTC+6)", () => {
      process.env.TZ = "Asia/Dhaka";
      at("2026-03-10T17:59:59Z"); // 23:59:59 on the 10th in Dhaka
      expect(localDateKey()).toBe("2026-03-10");
      store.recordPractice(1);
      at("2026-03-10T18:00:01Z"); // 00:00:01 on the 11th in Dhaka, still the 10th in UTC
      expect(localDateKey()).toBe("2026-03-11");
      expect(store.recordPractice(1).streak).toBe(2);
    });
    it("two sessions either side of UTC midnight but the same Dhaka day stay one day", () => {
      process.env.TZ = "Asia/Dhaka";
      at("2026-03-10T17:00:00Z"); // 23:00 on the 10th
      store.recordPractice(1);
      at("2026-03-10T10:00:00Z"); // 16:00 on the 10th
      const p = store.recordPractice(1);
      expect(p.streak).toBe(1);
      expect(Object.keys(p.daily)).toEqual(["2026-03-10"]);
    });
    it("western zone (America/Los_Angeles) at local midnight", () => {
      process.env.TZ = "America/Los_Angeles";
      at("2026-03-11T06:59:59Z"); // 23:59:59 on the 10th (PDT after DST starts on the 8th)
      expect(localDateKey()).toBe("2026-03-10");
      store.recordPractice(1);
      at("2026-03-11T07:00:01Z");
      expect(localDateKey()).toBe("2026-03-11");
      expect(store.recordPractice(1).streak).toBe(2);
    });
    it("DST change does not break the 1-day gap (US spring forward)", () => {
      process.env.TZ = "America/New_York";
      at("2026-03-07T20:00:00Z"); // 15:00 EST on the 7th
      store.recordPractice(1);
      at("2026-03-08T20:00:00Z"); // after spring-forward, the 8th
      expect(store.recordPractice(1).streak).toBe(2);
      at("2026-11-01T12:00:00Z");
      expect(localDateKey()).toBe("2026-11-01");
    });
  });
});

describe("corrupted / hostile localStorage", () => {
  const cases: [string, string][] = [
    ["not JSON", "{not json"],
    ["empty string", ""],
    ["JSON null", "null"],
    ["JSON number", "42"],
    ["JSON array", "[]"],
    ["wrong version", JSON.stringify({ version: 2, xp: 99 })],
    ["truncated", '{"version":1,"xp":5,'],
  ];
  it.each(cases)("%s -> falls back to empty progress without throwing", (_n, raw) => {
    window.localStorage.setItem(KEY, raw);
    const s = new LocalStorageProgressStore();
    expect(() => s.get()).not.toThrow();
    expect(s.get().xp).toBe(0);
    expect(s.get().settings).toEqual(DEFAULT_SETTINGS);
  });
  it("can write again after reading corrupt data", () => {
    window.localStorage.setItem(KEY, "{oops");
    const s = new LocalStorageProgressStore();
    expect(s.recordPractice(3).xp).toBe(3);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).xp).toBe(3);
  });
  it("version 1 with missing containers fills in defaults", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, xp: 8 }));
    const p = new LocalStorageProgressStore().get();
    expect(p.xp).toBe(8);
    expect(p.completed).toEqual({});
    expect(p.daily).toEqual({});
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
  });
  it("tolerates setItem throwing (quota / private mode): keeps state in memory", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const s = new LocalStorageProgressStore();
    expect(() => s.recordPractice(4)).not.toThrow();
    expect(s.get().xp).toBe(4);
    spy.mockRestore();
  });
  it("tolerates getItem throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const s = new LocalStorageProgressStore();
    expect(() => s.get()).not.toThrow();
    expect(s.get().xp).toBe(0);
    spy.mockRestore();
  });
});

describe("settings defaults / migration / sanitising", () => {
  it("old save without settings gets defaults", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, xp: 3, streak: 1, lastActiveDate: "2026-03-10", completed: {}, daily: {} }),
    );
    expect(new LocalStorageProgressStore().get().settings).toEqual(DEFAULT_SETTINGS);
  });
  it("partial settings are merged with defaults", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, settings: { dailyGoal: 50 } }));
    expect(new LocalStorageProgressStore().get().settings).toEqual({ ...DEFAULT_SETTINGS, dailyGoal: 50 });
  });
  it("invalid setting values fall back to defaults", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        settings: { translit: "loud", sound: "yes", ttsSpeed: 9, dailyGoal: 7 },
      }),
    );
    expect(new LocalStorageProgressStore().get().settings).toEqual(DEFAULT_SETTINGS);
  });
  it("updateSettings patches, validates and persists", () => {
    store.updateSettings({ dailyGoal: 30, translit: "hidden", sound: false, ttsSpeed: "slow" });
    expect(store.get().settings).toMatchObject({ dailyGoal: 30, translit: "hidden", sound: false, ttsSpeed: "slow" });
    // @ts-expect-error deliberately invalid
    store.updateSettings({ dailyGoal: 999 });
    expect(store.get().settings.dailyGoal).toBe(20);
    expect(new LocalStorageProgressStore().get().settings.translit).toBe("hidden");
  });
  it("reset erases progress but keeps settings", () => {
    store.updateSettings({ dailyGoal: 50 });
    store.completeLesson("a", 10, 1);
    store.reset();
    const p = store.get();
    expect(p.xp).toBe(0);
    expect(p.streak).toBe(0);
    expect(p.completed).toEqual({});
    expect(p.settings.dailyGoal).toBe(50);
  });
  it("does not mutate the frozen DEFAULT_SETTINGS / EMPTY_PROGRESS", () => {
    store.updateSettings({ dailyGoal: 10 });
    store.recordPractice(5);
    expect(DEFAULT_SETTINGS.dailyGoal).toBe(20);
    expect(EMPTY_PROGRESS.xp).toBe(0);
    expect(EMPTY_PROGRESS.completed).toEqual({});
  });
});

describe("lesson unlocking", () => {
  const unit = (id: string, lessons: string[]): UnitSummary => ({
    id, title: id, track: "main",
    lessons: lessons.map((l) => ({ id: l, title: l, kind: "lesson" as const, exerciseCount: 1, draft: false })),
  });
  const course: CourseSummary = {
    id: "c", title: "c", source: "content",
    units: [unit("u1", ["a", "b", "c"]), unit("u2", ["d", "e"])],
  };
  it("first lesson of every unit is open, the rest are locked", () => {
    expect(lessonStates(course.units[0], EMPTY_PROGRESS)).toEqual(["unlocked", "locked", "locked"]);
    expect(lessonStates(course.units[1], EMPTY_PROGRESS)).toEqual(["unlocked", "locked"]);
  });
  it("completing a lesson unlocks the next", () => {
    const p = store.completeLesson("a", 1, 1);
    expect(lessonStates(course.units[0], p)).toEqual(["completed", "unlocked", "locked"]);
  });
  it("nextLessonId follows course order", () => {
    expect(nextLessonId(course, EMPTY_PROGRESS)).toBe("a");
    store.completeLesson("a", 1, 1);
    expect(nextLessonId(course, store.get())).toBe("b");
    store.completeLesson("b", 1, 1);
    store.completeLesson("c", 1, 1);
    expect(nextLessonId(course, store.get())).toBe("d");
    store.completeLesson("d", 1, 1);
    store.completeLesson("e", 1, 1);
    expect(nextLessonId(course, store.get())).toBeUndefined();
  });
});
