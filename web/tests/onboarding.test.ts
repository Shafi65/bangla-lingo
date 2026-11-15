// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_KEY,
  clearOnboarding,
  hasAnyProgress,
  parseOnboarding,
  readOnboarding,
  resolveStartLesson,
  shouldShowOnboarding,
  writeOnboarding,
} from "@/lib/onboarding";
import { EMPTY_PROGRESS, type ProgressState } from "@/lib/progress";

beforeEach(() => window.localStorage.clear());

describe("storage", () => {
  it("is absent by default", () => {
    expect(readOnboarding()).toBeNull();
  });

  it("round-trips answers under its own key", () => {
    expect(writeOnboarding({ completed: true, skipped: false, reason: "travel", level: "some", startAt: "alphabet", completedAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_KEY)!)).toMatchObject({ version: 1, completed: true, reason: "travel" });
    expect(readOnboarding()).toEqual({
      version: 1,
      completed: true,
      skipped: false,
      reason: "travel",
      level: "some",
      startAt: "alphabet",
      completedAt: "2026-01-01T00:00:00Z",
    });
  });

  it("clear removes it", () => {
    writeOnboarding({ completed: true, skipped: true });
    clearOnboarding();
    expect(readOnboarding()).toBeNull();
  });

  it("treats malformed or unknown data as absent / drops bad fields", () => {
    expect(parseOnboarding("not json")).toBeNull();
    expect(parseOnboarding('{"version":2,"completed":true}')).toBeNull();
    expect(parseOnboarding('{"version":1}')).toBeNull();
    expect(parseOnboarding('{"version":1,"completed":true,"reason":"bogus","level":"some"}')).toMatchObject({
      completed: true,
      reason: undefined,
      level: "some",
    });
  });

  it("never throws when storage is unavailable", () => {
    const orig = Storage.prototype;
    const get = orig.getItem;
    const set = orig.setItem;
    const rm = orig.removeItem;
    orig.getItem = () => {
      throw new Error("denied");
    };
    orig.setItem = () => {
      throw new Error("quota");
    };
    orig.removeItem = () => {
      throw new Error("denied");
    };
    try {
      expect(readOnboarding()).toBeNull();
      expect(writeOnboarding({ completed: true, skipped: false })).toBe(false);
      expect(() => clearOnboarding()).not.toThrow();
    } finally {
      orig.getItem = get;
      orig.setItem = set;
      orig.removeItem = rm;
    }
  });
});

describe("shouldShowOnboarding", () => {
  const done = { version: 1 as const, completed: true, skipped: false };

  it("shows for a fresh visitor", () => {
    expect(shouldShowOnboarding(EMPTY_PROGRESS, null)).toBe(true);
  });
  it("does not show once completed or skipped", () => {
    expect(shouldShowOnboarding(EMPTY_PROGRESS, done)).toBe(false);
    expect(shouldShowOnboarding(EMPTY_PROGRESS, { ...done, skipped: true })).toBe(false);
  });
  it("shows when the flag is stored but not completed", () => {
    expect(shouldShowOnboarding(EMPTY_PROGRESS, { ...done, completed: false })).toBe(true);
  });
  it("never shows to anyone with progress", () => {
    const withXp: ProgressState = { ...EMPTY_PROGRESS, xp: 10 };
    const withLesson: ProgressState = {
      ...EMPTY_PROGRESS,
      completed: { "u01-l01": { completedAt: "2026-01-01", bestAccuracy: 1, timesCompleted: 1 } },
    };
    const withDay: ProgressState = { ...EMPTY_PROGRESS, lastActiveDate: "2026-01-01" };
    for (const p of [withXp, withLesson, withDay]) {
      expect(hasAnyProgress(p)).toBe(true);
      expect(shouldShowOnboarding(p, null)).toBe(false);
    }
  });
  it("changed settings alone do not count as progress", () => {
    const p: ProgressState = { ...EMPTY_PROGRESS, settings: { ...EMPTY_PROGRESS.settings, dailyGoal: 50 } };
    expect(shouldShowOnboarding(p, null)).toBe(true);
  });
});

describe("resolveStartLesson", () => {
  const t = { unit1LessonId: "u01-l01", alphabetLessonId: "s01-l01" };
  it("goes to Unit 1 for new learners", () => {
    expect(resolveStartLesson("new", "lesson", t)).toBe("u01-l01");
  });
  it("honours the alphabet and Unit 1 choices", () => {
    expect(resolveStartLesson("some", "alphabet", t)).toBe("s01-l01");
    expect(resolveStartLesson("some", "unit1", t)).toBe("u01-l01");
  });
  it("falls back to Unit 1 without an alphabet track", () => {
    expect(resolveStartLesson("some", "alphabet", { unit1LessonId: "u01-l01" })).toBe("u01-l01");
  });
});
