import { describe, expect, it } from "vitest";
import {
  applyEvent,
  buy,
  CHEST_COINS,
  chestReady,
  claimChest,
  coinBalance,
  COINS,
  emptyGame,
  ensureToday,
  FREEZE_PRICE,
  freezesHeld,
  MAX_FREEZES,
  mergeGame,
  questDef,
  questsForDay,
  sanitizeGame,
  spendFreezes,
  type GameState,
} from "@/lib/game/engine";
import { currentStreak, EMPTY_PROGRESS, freezePlan, streakEnd, streakStatus, type ProgressState } from "@/lib/progress";
import { mergeProgress, recomputeStreak } from "@/lib/sync/merge";

const opts = { canPractice: true };
const DAY = "2026-11-23";

describe("daily quests", () => {
  it("picks three quests of different kinds, the first about XP or lessons, the same on every call", () => {
    for (const day of ["2026-11-23", "2026-11-24", "2027-01-01", "2026-02-28"]) {
      const qs = questsForDay(day, opts);
      expect(qs).toHaveLength(3);
      expect(["xp", "lessons"]).toContain(qs[0].kind);
      expect(new Set(qs.map((q) => q.kind)).size).toBe(3);
      expect(questsForDay(day, opts)).toEqual(qs);
    }
  });

  it("leaves practice quests out until a lesson is finished", () => {
    for (let d = 1; d <= 28; d++) {
      const day = `2026-02-${String(d).padStart(2, "0")}`;
      expect(questsForDay(day, { canPractice: false }).some((q) => q.kind === "practice")).toBe(false);
    }
  });

  it("starts a fresh set on a new day", () => {
    const a = ensureToday(emptyGame(), "2026-11-22", opts);
    const b = ensureToday(a, DAY, opts);
    expect(b.today?.day).toBe(DAY);
    expect(b.today?.quests.every((q) => q.progress === 0)).toBe(true);
    expect(ensureToday(b, DAY, opts)).toBe(b);
  });
});

function gameWithQuests(ids: string[]): GameState {
  return { ...emptyGame(), today: { day: DAY, quests: ids.map((id) => ({ id, progress: 0 })), claimed: false } };
}

describe("events", () => {
  it("pays coins for a lesson, more for a perfect one, and advances quests", () => {
    const g = gameWithQuests(["xp-20", "lessons-1", "perfect-1"]);
    const r = applyEvent(g, { type: "lesson", mode: "lesson", xp: 20, perfect: true, streak: 1 }, DAY, opts);
    expect(r.coins).toBe(COINS.lesson + COINS.perfect);
    expect(r.questsDone.sort()).toEqual(["lessons-1", "perfect-1", "xp-20"]);
    expect(chestReady(r.state.today)).toBe(true);
    expect(r.state.stats.perfectLessons).toBe(1);
  });

  it("tracks the best combo and pays a bonus on every 5th answer in a row", () => {
    let g = gameWithQuests(["combo-5", "typed-3", "xp-20"]);
    let coins = 0;
    for (let combo = 1; combo <= 6; combo++) {
      const r = applyEvent(g, { type: "answer", correct: true, typed: combo <= 3, combo }, DAY, opts);
      g = r.state;
      coins += r.coins;
    }
    expect(coins).toBe(COINS.combo); // only the 5th in a row
    expect(g.stats.bestCombo).toBe(6);
    expect(g.stats.typedCorrect).toBe(3);
    expect(g.today?.quests.find((q) => q.id === "combo-5")?.progress).toBe(5);
    expect(g.today?.quests.find((q) => q.id === "typed-3")?.progress).toBe(3);
  });

  it("caps quest progress at the target", () => {
    const g = gameWithQuests(["xp-20", "combo-5", "typed-3"]);
    const r = applyEvent(g, { type: "lesson", mode: "lesson", xp: 500, perfect: false, streak: 1 }, DAY, opts);
    expect(r.state.today?.quests[0].progress).toBe(questDef("xp-20")!.target);
  });

  it("gives one free freeze on each 7th streak day, once per day, while there is room", () => {
    const lesson = (streak: number) => ({ type: "lesson" as const, mode: "lesson" as const, xp: 10, perfect: false, streak });
    let g = applyEvent(emptyGame(), lesson(6), DAY, opts).state;
    expect(freezesHeld(g)).toBe(0);
    const r = applyEvent(g, lesson(7), DAY, opts);
    expect(r.freeFreeze).toBe(true);
    g = applyEvent(r.state, lesson(7), DAY, opts).state; // same day again
    expect(freezesHeld(g)).toBe(1);
    g = applyEvent(g, lesson(14), "2026-11-30", opts).state;
    g = applyEvent(g, lesson(21), "2026-12-07", opts).state;
    expect(freezesHeld(g)).toBe(MAX_FREEZES);
  });
});

describe("chest and shop", () => {
  it("opens the chest only once, when every quest is done", () => {
    const g = gameWithQuests(["lessons-1"]);
    expect(claimChest(g).coins).toBe(0);
    const done = applyEvent(g, { type: "lesson", mode: "lesson", xp: 10, perfect: false, streak: 1 }, DAY, opts).state;
    const r = claimChest(done);
    expect(r.coins).toBe(CHEST_COINS);
    expect(claimChest(r.state).coins).toBe(0);
    expect(r.state.stats.chests).toBe(1);
  });

  it("sells a freeze for coins, up to the limit", () => {
    let g: GameState = { ...emptyGame(), coinsEarned: FREEZE_PRICE * 3 };
    for (let i = 0; i < MAX_FREEZES; i++) {
      const r = buy(g, "freeze", 0);
      expect(r.ok).toBe(true);
      if (r.ok) g = r.state;
    }
    expect(buy(g, "freeze", 0)).toEqual({ ok: false, reason: "full" });
    expect(coinBalance(g)).toBe(FREEZE_PRICE);
    expect(buy({ ...emptyGame(), coinsEarned: FREEZE_PRICE - 1 }, "freeze", 0)).toEqual({ ok: false, reason: "coins" });
  });
});

describe("streak freezes in progress", () => {
  const p = (over: Partial<ProgressState>): ProgressState => ({ ...EMPTY_PROGRESS, ...over });

  it("plans to cover the missed days when enough freezes are held", () => {
    const prog = p({ streak: 9, lastActiveDate: "2026-11-20" });
    expect(freezePlan(prog, 2, DAY)).toEqual(["2026-11-21", "2026-11-22"]);
    expect(freezePlan(prog, 1, DAY)).toEqual([]); // 2 missed, 1 freeze: the streak is lost
    expect(freezePlan(p({ streak: 9, lastActiveDate: "2026-11-22" }), 2, DAY)).toEqual([]); // nothing missed
  });

  it("keeps the streak alive through frozen days without counting them", () => {
    const prog = p({ streak: 9, lastActiveDate: "2026-11-20", frozen: ["2026-11-21", "2026-11-22"] });
    expect(streakEnd(prog)).toBe("2026-11-22");
    expect(currentStreak(prog, DAY)).toBe(9);
    expect(streakStatus(prog, DAY)).toBe("at-risk");
    expect(currentStreak(p({ streak: 9, lastActiveDate: "2026-11-20" }), DAY)).toBe(0);
  });

  it("recomputes a synced streak across frozen days", () => {
    const daily = { "2026-11-18": 10, "2026-11-19": 10, "2026-11-21": 10 };
    expect(recomputeStreak("2026-11-21", [daily], [], ["2026-11-20"])).toBe(3);
    expect(recomputeStreak("2026-11-21", [daily], [])).toBe(1);
    const merged = mergeProgress(
      { xp: 30, streak: 3, lastActiveDate: "2026-11-21", completed: {}, daily, frozen: ["2026-11-20"] },
      { xp: 20, streak: 2, lastActiveDate: "2026-11-19", completed: {}, daily: { "2026-11-18": 10, "2026-11-19": 10 } },
    );
    expect(merged.frozen).toEqual(["2026-11-20"]);
    expect(merged.streak).toBe(3);
  });

  it("records spent freezes and a one-off notice", () => {
    const g = spendFreezes({ ...emptyGame(), freezesEarned: 2 }, 2, DAY);
    expect(freezesHeld(g)).toBe(0);
    expect(g.stats.freezesSaved).toBe(2);
    expect(g.notice).toEqual({ kind: "freeze-used", days: 2, day: DAY });
  });
});

describe("sanitize and merge", () => {
  it("survives junk", () => {
    expect(sanitizeGame(null)).toEqual(emptyGame());
    expect(sanitizeGame({ v: 1, coinsEarned: -5, coinsSpent: 99, today: { day: "x" } })).toEqual(emptyGame());
    const g = sanitizeGame({ v: 1, coinsEarned: 10, coinsSpent: 20, today: { day: DAY, quests: [{ id: "nope" }, { id: "xp-20", progress: 999 }] } });
    expect(g.coinsSpent).toBe(10);
    expect(g.today?.quests).toEqual([{ id: "xp-20", progress: 20 }]);
  });

  it("merges two devices without double-counting", () => {
    const a: GameState = { ...gameWithQuests(["xp-20", "combo-5"]), coinsEarned: 50, coinsSpent: 0, stats: { ...emptyGame().stats, bestCombo: 4 } };
    a.today!.quests[0].progress = 15;
    const b: GameState = { ...gameWithQuests(["xp-20", "combo-5"]), coinsEarned: 40, coinsSpent: FREEZE_PRICE / 2, freezesEarned: 1, stats: { ...emptyGame().stats, bestCombo: 7 } };
    b.today!.quests[1].progress = 5;
    b.today!.claimed = true;
    const m = mergeGame(a, b);
    expect(m.coinsEarned).toBe(50);
    expect(m.coinsSpent).toBe(30);
    expect(m.freezesEarned).toBe(1);
    expect(m.stats.bestCombo).toBe(7);
    expect(m.today?.quests).toEqual([{ id: "xp-20", progress: 15 }, { id: "combo-5", progress: 5 }]);
    expect(m.today?.claimed).toBe(true);
    expect(mergeGame(m, m)).toEqual(m);
  });

  it("keeps the later day's quests", () => {
    const old = { ...gameWithQuests(["xp-20"]), today: { day: "2026-11-01", quests: [{ id: "xp-20", progress: 20 }], claimed: true } };
    const now = gameWithQuests(["lessons-1"]);
    expect(mergeGame(old, now).today?.day).toBe(DAY);
    expect(mergeGame(now, old).today?.day).toBe(DAY);
  });
});
