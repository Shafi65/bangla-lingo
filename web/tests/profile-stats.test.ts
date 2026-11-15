import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, type ProgressState } from "@/lib/progress";
import { EMPTY_MEMORY, type WordMemoryState } from "@/lib/review/state";
import type { WordRecord } from "@/lib/review/scheduler";
import type { CourseSummary, LessonSummary } from "@/lib/types";
import {
  activeDaySet,
  addDays,
  bestStreak,
  dayDiff,
  hasReviewed,
  heatLevel,
  learnedWordIds,
  longDate,
  longestRun,
  niceTicks,
  bnDigits,
  compact,
  profileStats,
  shortDate,
  strengthCounts,
  streakCalendar,
  unitProgress,
  weekdayMon,
  xpSeries,
} from "@/lib/profile";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const DAY = 86_400_000;
const lesson = (id: string): LessonSummary => ({ id, title: id, kind: "lesson", exerciseCount: 10, draft: false });
const COURSE: CourseSummary = {
  id: "c",
  title: "C",
  source: "fixture",
  units: [
    { id: "u1", title: "Basics", track: "main", lessons: [lesson("u1-l1"), lesson("u1-l2")] },
    { id: "s1", title: "Vowels", track: "script", lessons: [lesson("s1-l1")] },
    { id: "u2", title: "People", track: "main", lessons: [lesson("u2-l1"), lesson("u2-l2"), lesson("u2-l3")] },
  ],
};

function prog(patch: Partial<ProgressState>): ProgressState {
  return { ...EMPTY_PROGRESS, ...patch };
}
function rec(id: string, patch: Partial<WordRecord>): WordRecord {
  return { id, reps: 1, lapses: 0, stability: 1.5, difficulty: 5, due: 0, lastSeen: 0, run: 1, ...patch };
}
function mem(words: WordRecord[]): WordMemoryState {
  return { version: 1, words: Object.fromEntries(words.map((w) => [w.id, w])), pending: [] };
}

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayDiff("2026-11-01", "2026-11-15")).toBe(14);
  });
  it("numbers weekdays from Monday and formats without locale", () => {
    expect(weekdayMon("2026-11-16")).toBe(0); // Monday
    expect(weekdayMon("2026-11-15")).toBe(6); // Sunday
    expect(shortDate("2026-11-05")).toBe("Nov 5");
    expect(longDate("2026-11-15")).toBe("Sunday, Nov 15");
  });
});

describe("days and streaks", () => {
  it("collects active days from XP and completions", () => {
    const p = prog({
      daily: { "2026-11-10": 20, "2026-11-11": 0 },
      completed: { a: { completedAt: "2026-08-01T10:00:00Z", bestAccuracy: 1, timesCompleted: 1 } },
      lastActiveDate: "2026-11-10",
    });
    expect([...activeDaySet(p)].sort()).toEqual(["2026-08-01", "2026-11-10"]);
  });

  it("finds the longest consecutive run", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"])).toBe(3);
    expect(longestRun(["2026-12-31", "2027-01-01"])).toBe(2);
  });

  it("best streak is never below the stored streak", () => {
    const p = prog({ streak: 9, lastActiveDate: "2026-11-15", daily: { "2026-11-15": 10 } });
    expect(bestStreak(p, "2026-11-15")).toBe(9);
    const q = prog({
      streak: 1,
      lastActiveDate: "2026-11-15",
      daily: { "2026-11-01": 5, "2026-11-02": 5, "2026-11-03": 5, "2026-11-04": 5, "2026-11-15": 5 },
    });
    expect(bestStreak(q, "2026-11-15")).toBe(4);
  });
});

describe("xpSeries", () => {
  it("returns one entry per day ending today, zeros filled", () => {
    const s = xpSeries(prog({ daily: { "2026-11-15": 30, "2026-11-14": 12.4, "2026-10-01": 99 } }), "2026-11-15", 30);
    expect(s).toHaveLength(30);
    expect(s[0].date).toBe("2026-10-17");
    expect(s.at(-1)).toEqual({ date: "2026-11-15", xp: 30 });
    expect(s.at(-2)).toEqual({ date: "2026-11-14", xp: 12 });
    expect(s.filter((d) => d.xp > 0)).toHaveLength(2);
  });
});

describe("streakCalendar", () => {
  it("lays out weeks Monday..Sunday with today in the last column", () => {
    const p = prog({ daily: { "2026-11-11": 20 }, lastActiveDate: "2026-11-11" });
    const cal = streakCalendar(p, "2026-11-11", 12); // Wednesday
    expect(cal).toHaveLength(12);
    expect(cal.every((c) => c.length === 7)).toBe(true);
    const last = cal[11];
    expect(last[0].date).toBe("2026-11-09");
    expect(last[2]).toMatchObject({ date: "2026-11-11", xp: 20, level: 3, active: true, future: false });
    expect(last[3]).toMatchObject({ future: true, level: 0 });
    expect(cal[0][0].date).toBe("2026-08-24");
  });

  it("bins XP against the daily goal", () => {
    expect(heatLevel(0, false, 20)).toBe(0);
    expect(heatLevel(0, true, 20)).toBe(1); // completion known, XP not logged
    expect(heatLevel(5, true, 20)).toBe(1);
    expect(heatLevel(10, true, 20)).toBe(2);
    expect(heatLevel(20, true, 20)).toBe(3);
    expect(heatLevel(40, true, 20)).toBe(4);
  });
});

describe("words", () => {
  const words = [
    { id: "w1", lesson: "u1-l1" },
    { id: "w2", lesson: "u1-l1" },
    { id: "w3", lesson: "u1-l2" },
    { id: "w4", lesson: "u2-l1" },
  ];
  it("counts words graded or taught by a completed lesson", () => {
    const completed = { "u1-l1": { completedAt: "2026-11-01T10:00:00Z", bestAccuracy: 1, timesCompleted: 1 } };
    expect(learnedWordIds(words, mem([rec("w4", {})]), completed)).toEqual(["w1", "w2", "w4"]);
  });
  it("buckets strength using the review scheduler", () => {
    const now = Date.UTC(2026, 10, 15);
    const m = mem([
      rec("a", { stability: 0.5, lastSeen: now - 1000 }),
      rec("b", { stability: 2, lastSeen: now - 1000 }),
      rec("c", { stability: 10, lastSeen: now - 1000 }),
      rec("d", { stability: 40, lastSeen: now - 1000 }),
    ]);
    expect(strengthCounts(["a", "b", "c", "d", "never"], m, now)).toEqual({ 1: 2, 2: 1, 3: 1, 4: 1 });
  });
});

describe("hasReviewed", () => {
  const end = Date.UTC(2026, 10, 10, 12);
  const completed = { x: { completedAt: new Date(end).toISOString(), bestAccuracy: 1, timesCompleted: 1 } };
  it("ignores answers given during a lesson", () => {
    expect(hasReviewed(mem([rec("a", { reps: 3, lastSeen: end - 5 * 60_000 })]), completed)).toBe(false);
  });
  it("detects answers given outside any lesson", () => {
    expect(hasReviewed(mem([rec("a", { reps: 2, lastSeen: end + DAY })]), completed)).toBe(true);
  });
  it("needs a word seen more than once", () => {
    expect(hasReviewed(mem([rec("a", { reps: 1, lastSeen: end + DAY })]), completed)).toBe(false);
    expect(hasReviewed(EMPTY_MEMORY, {})).toBe(false);
  });
});

describe("unitProgress and profileStats", () => {
  const completed = {
    "u1-l1": { completedAt: "2026-11-14T10:00:00Z", bestAccuracy: 1, timesCompleted: 1 },
    "u1-l2": { completedAt: "2026-11-15T09:00:00Z", bestAccuracy: 0.8, timesCompleted: 2 },
    "s1-l1": { completedAt: "2026-11-15T09:30:00Z", bestAccuracy: 0.9, timesCompleted: 1 },
  };
  it("labels and counts each unit", () => {
    expect(unitProgress(COURSE, completed)).toEqual([
      { id: "u1", label: "Unit 1", title: "Basics", track: "main", done: 2, total: 2 },
      { id: "s1", label: "Script 1", title: "Vowels", track: "script", done: 1, total: 1 },
      { id: "u2", label: "Unit 2", title: "People", track: "main", done: 0, total: 3 },
    ]);
  });

  it("summarises everything", () => {
    const p = prog({
      xp: 120,
      streak: 2,
      lastActiveDate: "2026-11-15",
      daily: { "2026-11-14": 50, "2026-11-15": 70 },
      completed,
    });
    const s = profileStats({
      progress: p,
      memory: EMPTY_MEMORY,
      words: [{ id: "w1", lesson: "u1-l1" }, { id: "w2", lesson: "u2-l1" }],
      course: COURSE,
      today: "2026-11-15",
      now: Date.UTC(2026, 10, 15, 12),
    });
    expect(s).toMatchObject({
      xp: 120,
      streak: 2,
      bestStreak: 2,
      wordsLearned: 1,
      lessonsCompleted: 3,
      daysActive: 2,
      perfectLessons: 1,
      unitsFinished: 2,
      scriptComplete: true,
      scriptDone: 1,
      scriptTotal: 1,
      isNew: false,
      reviewed: false,
    });
    expect(s.strength).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0 });
  });

  it("flags a brand-new learner", () => {
    const s = profileStats({ progress: EMPTY_PROGRESS, memory: EMPTY_MEMORY, words: [], course: COURSE, today: "2026-11-15", now: 1 });
    expect(s).toMatchObject({ isNew: true, xp: 0, streak: 0, bestStreak: 0, daysActive: 0, scriptComplete: false });
  });
});

describe("niceTicks", () => {
  it("returns clean ticks covering the maximum", () => {
    expect(niceTicks(70)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(0)).toEqual([0, 5, 10]);
    expect(niceTicks(80)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(Number.NaN)).toEqual([0, 5, 10]);
  });
});

describe("format", () => {
  it("writes Bengali digits and compacts large numbers", () => {
    expect(bnDigits("1,250")).toBe("১,২৫০");
    expect(bnDigits(907)).toBe("৯০৭");
    expect(compact(9999)).toBe("9,999");
    expect(compact(12_900)).toBe("12.9K");
    expect(compact(250_000)).toBe("250K");
    expect(compact(1_000_000)).toBe("1M");
  });
});
