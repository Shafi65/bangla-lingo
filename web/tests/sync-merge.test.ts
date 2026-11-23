import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type LessonRecord } from "@/lib/progress";
import type { WordRecord } from "@/lib/review/scheduler";
import {
  mergeCompleted,
  mergeDaily,
  mergeFeatures,
  mergeFormality,
  mergeLessonRecord,
  mergeOnboarding,
  mergePlacement,
  mergeProgress,
  mergeSettings,
  mergeSpeak,
  mergeWords,
  mergeWrite,
  recomputeStreak,
  type ProgressCore,
} from "@/lib/sync/merge";
import { encodeWords, parseFeaturesDoc, parseMemoryDoc, parseProgressDoc, parseSettingsDoc, stableStringify } from "@/lib/sync/codec";
import type { StoredPlacement } from "@/lib/placement/apply";

const played = (at: string, acc: number, times = 1): LessonRecord => ({ completedAt: at, bestAccuracy: acc, timesCompleted: times });
const placed = (at: string, via?: "checkpoint"): LessonRecord => ({
  completedAt: at,
  bestAccuracy: 0,
  timesCompleted: 0,
  placed: true,
  ...(via ? { via } : {}),
});

const core = (p: Partial<ProgressCore> = {}): ProgressCore => ({
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completed: {},
  daily: {},
  ...p,
});

describe("lesson records", () => {
  it("a lesson completed on either side stays completed", () => {
    const m = mergeCompleted({ a: played("2026-01-01T00:00:00Z", 1) }, { b: played("2026-01-02T00:00:00Z", 0.5) });
    expect(Object.keys(m).sort()).toEqual(["a", "b"]);
  });

  it("keeps the best accuracy, the most completions and the latest completion time", () => {
    const m = mergeLessonRecord(played("2026-01-05T00:00:00Z", 0.7, 3), played("2026-01-09T00:00:00Z", 0.95, 1));
    expect(m).toEqual({ completedAt: "2026-01-09T00:00:00Z", bestAccuracy: 0.95, timesCompleted: 3 });
  });

  it("a real play beats placed or tested out, from either side", () => {
    const real = played("2026-01-01T00:00:00Z", 0.8);
    expect(mergeLessonRecord(placed("2026-02-01T00:00:00Z"), real)).toBe(real);
    expect(mergeLessonRecord(real, placed("2026-02-01T00:00:00Z", "checkpoint"))).toBe(real);
  });

  it("between two skips, a checkpoint test-out beats placement, else the earlier is kept", () => {
    const p = placed("2026-01-01T00:00:00Z");
    const c = placed("2026-03-01T00:00:00Z", "checkpoint");
    expect(mergeLessonRecord(p, c)).toBe(c);
    expect(mergeLessonRecord(c, p)).toBe(c);
    const early = placed("2026-01-01T00:00:00Z");
    expect(mergeLessonRecord(placed("2026-02-01T00:00:00Z"), early)).toBe(early);
  });
});

describe("XP, daily log and streak", () => {
  it("XP is the max of the totals (idempotent)", () => {
    expect(mergeProgress(core({ xp: 120 }), core({ xp: 80 })).xp).toBe(120);
    const once = mergeProgress(core({ xp: 50 }), core({ xp: 90 }));
    expect(mergeProgress(once, core({ xp: 90 })).xp).toBe(90);
  });

  it("merges the daily log per day by max", () => {
    expect(mergeDaily({ "2026-03-01": 10, "2026-03-02": 30 }, { "2026-03-02": 20, "2026-03-03": 15 })).toEqual({
      "2026-03-01": 10,
      "2026-03-02": 30,
      "2026-03-03": 15,
    });
  });

  it("trims the daily log to 60 days before the latest day and drops junk keys", () => {
    const m = mergeDaily({ "2025-12-01": 5, "2026-03-01": 10, junk: 3 } as Record<string, number>, { "2026-02-01": -4 }, "2026-03-01");
    expect(m).toEqual({ "2026-02-01": 0, "2026-03-01": 10 });
  });

  it("recomputes the streak from the union of active days", () => {
    // Device A did 1st-3rd, device B did 4th-5th: together a 5-day streak.
    const a = core({ lastActiveDate: "2026-03-03", streak: 3, daily: { "2026-03-01": 10, "2026-03-02": 10, "2026-03-03": 10 } });
    const b = core({ lastActiveDate: "2026-03-05", streak: 2, daily: { "2026-03-04": 10, "2026-03-05": 10 } });
    const m = mergeProgress(a, b);
    expect(m.lastActiveDate).toBe("2026-03-05");
    expect(m.streak).toBe(5);
    expect(mergeProgress(b, a).streak).toBe(5);
  });

  it("a gap breaks the merged streak", () => {
    const a = core({ lastActiveDate: "2026-03-02", streak: 2, daily: { "2026-03-01": 10, "2026-03-02": 10 } });
    const b = core({ lastActiveDate: "2026-03-05", streak: 1, daily: { "2026-03-05": 10 } });
    expect(mergeProgress(a, b).streak).toBe(1);
  });

  it("keeps a long streak older than the daily log via the stored streak", () => {
    // 100-day streak ending 2026-03-05; daily log only has the last 60 days.
    const daily: Record<string, number> = {};
    for (let d = 5; d >= 1; d--) daily[`2026-03-0${d}`] = 10;
    const a = core({ lastActiveDate: "2026-03-05", streak: 100, daily });
    const b = core({ lastActiveDate: "2026-03-06", streak: 1, daily: { "2026-03-06": 10 } });
    expect(mergeProgress(a, b).streak).toBe(101);
  });

  it("streak is 0 with no activity and never absurd", () => {
    expect(recomputeStreak(null, [], [])).toBe(0);
    expect(recomputeStreak("2026-03-05", [], [{ lastActiveDate: "2026-03-05", streak: 1e12 }])).toBe(20_000);
  });

  it("merging is commutative and idempotent for progress", () => {
    const a = core({ xp: 40, lastActiveDate: "2026-03-03", streak: 2, completed: { l1: played("2026-03-03T10:00:00Z", 0.9) }, daily: { "2026-03-02": 20, "2026-03-03": 20 } });
    const b = core({ xp: 30, lastActiveDate: "2026-03-04", streak: 1, completed: { l2: placed("2026-03-04T10:00:00Z") }, daily: { "2026-03-04": 30 } });
    const ab = mergeProgress(a, b);
    expect(stableStringify(ab)).toBe(stableStringify(mergeProgress(b, a)));
    expect(stableStringify(mergeProgress(ab, b))).toBe(stableStringify(ab));
    expect(stableStringify(mergeProgress(ab, ab))).toBe(stableStringify(ab));
  });
});

describe("word memory", () => {
  const w = (id: string, lastSeen: number, extra: Partial<WordRecord> = {}): WordRecord => ({
    id,
    reps: 1,
    lapses: 0,
    stability: 1.5,
    difficulty: 5,
    due: lastSeen + 1000,
    lastSeen,
    run: 1,
    ...extra,
  });

  it("per word, keeps the record with the later lastSeen", () => {
    const m = mergeWords({ a: w("a", 100), b: w("b", 500) }, { a: w("a", 200, { reps: 2 }), b: w("b", 400), c: w("c", 1) });
    expect(m.a.lastSeen).toBe(200);
    expect(m.b.lastSeen).toBe(500);
    expect(m.c).toBeDefined();
  });

  it("ties: more reps, then more lapses, then this device", () => {
    expect(mergeWords({ a: w("a", 1, { reps: 2 }) }, { a: w("a", 1, { reps: 5 }) }).a.reps).toBe(5);
    expect(mergeWords({ a: w("a", 1, { lapses: 2 }) }, { a: w("a", 1, { lapses: 1 }) }).a.lapses).toBe(2);
    const local = w("a", 1, { stability: 9 });
    expect(mergeWords({ a: local }, { a: w("a", 1, { stability: 3 }) }).a).toBe(local);
  });

  it("round-trips through the compact server form and rejects junk", () => {
    const words = { a: w("a", 100, { lastWrong: 50 }), b: w("b", 7) };
    expect(parseMemoryDoc(encodeWords(words))).toEqual(words);
    expect(parseMemoryDoc({ v: 1, w: { x: "nope", y: [1, 2] } })).toEqual({});
    expect(parseMemoryDoc({ v: 2, w: {} })).toBeNull();
    expect(parseMemoryDoc("junk")).toBeNull();
  });
});

describe("settings and onboarding", () => {
  it("last writer wins per key, by change time", () => {
    const local = { settings: { ...DEFAULT_SETTINGS, dailyGoal: 30 as const, sound: false }, stamps: { dailyGoal: 200, sound: 50 } };
    const remote = { settings: { ...DEFAULT_SETTINGS, dailyGoal: 50 as const, sound: true, theme: "dark" as const }, stamps: { dailyGoal: 100, sound: 90, theme: 10 } };
    const m = mergeSettings(local, remote);
    expect(m.settings.dailyGoal).toBe(30);
    expect(m.settings.sound).toBe(true);
    expect(m.settings.theme).toBe("dark");
    expect(m.stamps).toEqual({ dailyGoal: 200, sound: 90, theme: 10 });
  });

  it("an unstamped (default) local key loses to any stamped remote key; ties keep local", () => {
    const m = mergeSettings({ settings: DEFAULT_SETTINGS, stamps: {} }, { settings: { ...DEFAULT_SETTINGS, translit: "hidden" }, stamps: { translit: 5 } });
    expect(m.settings.translit).toBe("hidden");
    const t = mergeSettings({ settings: { ...DEFAULT_SETTINGS, ttsSpeed: "slow" }, stamps: { ttsSpeed: 5 } }, { settings: { ...DEFAULT_SETTINGS, ttsSpeed: "fast" }, stamps: { ttsSpeed: 5 } });
    expect(t.settings.ttsSpeed).toBe("slow");
  });

  it("onboarding finished on either side counts as finished", () => {
    const done = { version: 1 as const, completed: true, skipped: false, reason: "family" as const };
    const notDone = { version: 1 as const, completed: false, skipped: false };
    expect(mergeOnboarding(notDone, done)).toBe(done);
    expect(mergeOnboarding(done, notDone)).toBe(done);
    expect(mergeOnboarding(null, done)).toBe(done);
  });

  it("parses untrusted settings documents safely", () => {
    const d = parseSettingsDoc({ settings: { dailyGoal: 999, theme: "dark" }, stamps: { theme: 5, bogus: 3, sound: "x" }, onboarding: { version: 1, completed: true } });
    expect(d?.settings.dailyGoal).toBe(DEFAULT_SETTINGS.dailyGoal);
    expect(d?.settings.theme).toBe("dark");
    expect(d?.stamps).toEqual({ theme: 5 });
    expect(d?.onboarding?.completed).toBe(true);
    expect(parseSettingsDoc(null)).toBeNull();
  });
});

describe("practice features", () => {
  it("formality: max unlocked, best per tier and rounds", () => {
    expect(mergeFormality({ v: 1, unlocked: 2, best: { "1": 5, "2": 3 }, rounds: 4 }, { v: 1, unlocked: 3, best: { "2": 6, "3": 1 }, rounds: 2 })).toEqual({
      v: 1,
      unlocked: 3,
      best: { "1": 5, "2": 6, "3": 1 },
      rounds: 4,
    });
  });

  it("handwriting: the better state per letter", () => {
    expect(mergeWrite({ version: 1, letters: { a: "traced", b: "written" } }, { version: 1, letters: { a: "written", b: "traced", c: "traced" } })).toEqual({
      version: 1,
      letters: { a: "written", b: "written", c: "traced" },
    });
  });

  it("speaking: the later rating per item", () => {
    const m = mergeSpeak({ x: { n: 3, last: 2, at: 100, recent: [2] } }, { x: { n: 1, last: 0, at: 200, recent: [0] }, y: { n: 1, last: 1, at: 5, recent: [1] } });
    expect(m?.x.at).toBe(200);
    expect(m?.y).toBeDefined();
  });

  it("placement: the more recent test", () => {
    const p = (takenAt: string) => ({ version: 1, takenAt, accepted: true, startLessonId: "u02-l01" }) as StoredPlacement;
    expect(mergePlacement(p("2026-01-01T00:00:00Z"), p("2026-02-01T00:00:00Z"))?.takenAt).toBe("2026-02-01T00:00:00Z");
    expect(mergePlacement(p("2026-03-01T00:00:00Z"), p("2026-02-01T00:00:00Z"))?.takenAt).toBe("2026-03-01T00:00:00Z");
  });

  it("missing sides fall back to the other", () => {
    const f = { formality: null, write: { version: 1 as const, letters: { a: "traced" as const } }, speak: null, placement: null };
    expect(mergeFeatures(f, { formality: null, write: null, speak: null, placement: null })).toEqual(f);
  });

  it("parses untrusted feature and progress documents safely", () => {
    expect(parseFeaturesDoc({ formality: { v: 9 }, write: { letters: { a: "bogus", b: "written" } }, speak: "x", placement: { version: 1 } })).toEqual({
      formality: { v: 1, unlocked: 1, best: {}, rounds: 0 },
      write: { version: 1, letters: { b: "written" } },
      speak: null,
      placement: null,
    });
    expect(parseProgressDoc({ xp: "lots", streak: -3, lastActiveDate: "yesterday", completed: { l: { placed: "yes", completedAt: "x", bestAccuracy: 1, timesCompleted: 1 } }, daily: { "2026-01-01": 5, bad: 2 } })).toEqual({
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      completed: { l: { completedAt: "x", bestAccuracy: 1, timesCompleted: 1 } },
      daily: { "2026-01-01": 5 },
    });
    expect(parseProgressDoc([1])).toBeNull();
  });
});
