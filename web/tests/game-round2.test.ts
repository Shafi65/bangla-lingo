import { describe, expect, it } from "vitest";
import {
  applyEvent,
  boostActive,
  BOOST_MINUTES,
  buy,
  coinBalance,
  emptyGame,
  equipLamp,
  GOAL_COINS,
  goalChoices,
  lampColor,
  marketDays,
  mergeGame,
  sanitizeGame,
  openGoal,
  setStreakGoal,
  shopItem,
  SPEED_DAILY_COINS,
  speedCoins,
  SPEED_MAX_COINS,
  type GameState,
} from "@/lib/game/engine";
import { matchPoints, multiplier, nextWord, speedPool } from "@/lib/game/speed";
import { streakWeek } from "@/lib/game/streak";
import { EMPTY_PROGRESS, type ProgressState } from "@/lib/progress";
import type { ReviewWord } from "@/lib/review/types";

const DAY = "2026-11-25";
const opts = { canPractice: true };
const rich = (coins = 500): GameState => ({ ...emptyGame(), coinsEarned: coins });
const lesson = (streak: number) => ({ type: "lesson" as const, mode: "lesson" as const, xp: 10, perfect: false, streak });

describe("streak goals", () => {
  it("offers the next three lengths above the current streak", () => {
    expect(goalChoices(0)).toEqual([7, 14, 30]);
    expect(goalChoices(7)).toEqual([14, 30, 50]);
    expect(goalChoices(400)).toEqual([]);
  });

  it("pays once when the streak reaches the goal, then clears it", () => {
    let g = setStreakGoal(emptyGame(), 7, DAY);
    expect(setStreakGoal(emptyGame(), 8, DAY).goal).toBeNull(); // not a goal length
    g = applyEvent(g, lesson(6), DAY, opts).state;
    expect(g.goal?.target).toBe(7);
    const r = applyEvent(g, lesson(7), DAY, opts);
    expect(r.goalReached).toBe(7);
    expect(openGoal(r.state)).toBeNull();
    expect(r.state.goal?.reached).toBe(true);
    expect(r.state.stats.goalsReached).toBe(1);
    expect(r.coins).toBeGreaterThanOrEqual(GOAL_COINS[7]);
  });
});

describe("shop", () => {
  it("sells a review boost that stacks", () => {
    const now = 1_800_000_000_000;
    const a = buy(rich(), "boost", now);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(boostActive(a.state, now + 1)).toBe(true);
    expect(boostActive(a.state, now + BOOST_MINUTES * 60_000 + 1)).toBe(false);
    const b = buy(a.state, "boost", now + 60_000);
    expect(b.ok && b.state.boostUntil).toBe(now + 2 * BOOST_MINUTES * 60_000);
  });

  it("market day doubles one bazaar visit", () => {
    const r = buy(rich(), "market-day", 0);
    if (!r.ok) throw new Error("buy failed");
    expect(marketDays(r.state)).toBe(1);
    const visit = applyEvent(r.state, { type: "bazaar", saved: 20, coins: 9 }, DAY, opts);
    expect(visit.coins).toBe(18);
    expect(visit.marketDay).toBe(true);
    expect(marketDays(visit.state)).toBe(0);
    expect(applyEvent(visit.state, { type: "bazaar", saved: 0, coins: 9 }, DAY, opts).coins).toBe(9);
  });

  it("lamps are bought once, lit on purchase, and can be swapped back", () => {
    const r = buy(rich(), "lamp-river", 0);
    if (!r.ok) throw new Error("buy failed");
    expect(r.state.lamp).toBe("lamp-river");
    expect(lampColor(r.state)).toBe(shopItem("lamp-river")!.color);
    expect(buy(r.state, "lamp-river", 0)).toEqual({ ok: false, reason: "owned" });
    expect(equipLamp(r.state, null).lamp).toBeNull();
    expect(equipLamp(r.state, "lamp-leaf").lamp).toBe("lamp-river"); // not owned
    expect(coinBalance(r.state)).toBe(500 - shopItem("lamp-river")!.price);
  });

  it("refuses unknown items and short balances", () => {
    expect(buy(rich(), "nope", 0)).toEqual({ ok: false, reason: "unknown" });
    expect(buy(rich(10), "boost", 0)).toEqual({ ok: false, reason: "coins" });
  });
});

describe("sync of round-2 fields", () => {
  it("sanitizes and merges goals, lamps, boosts and market days", () => {
    expect(sanitizeGame({ v: 1, owned: ["lamp-river", "freeze", 3], lamp: "lamp-leaf" })).toMatchObject({ owned: ["lamp-river"], lamp: null });
    const a: GameState = { ...emptyGame(), owned: ["lamp-river"], lamp: "lamp-river", boostUntil: 50, marketBought: 2, marketUsed: 1, goal: { target: 14, day: "2026-11-20", seq: 1 } };
    const b: GameState = { ...emptyGame(), owned: ["lamp-leaf"], lamp: "lamp-leaf", boostUntil: 90, marketBought: 1, marketUsed: 1, goal: { target: 30, day: "2026-11-24", seq: 2 } };
    const m = mergeGame(a, b);
    expect(m.owned.sort()).toEqual(["lamp-leaf", "lamp-river"]);
    expect(m.lamp).toBe("lamp-river");
    expect(m.boostUntil).toBe(90);
    expect(marketDays(m)).toBe(1);
    expect(m.goal?.target).toBe(30);
    expect(mergeGame(m, m)).toEqual(m);
  });
});

describe("review fixes: sync can't re-pay or undo", () => {
  it("a reached goal stays reached when merged with the stale server copy", () => {
    const server = setStreakGoal(emptyGame(), 7, DAY);
    const reached = applyEvent(server, lesson(7), DAY, opts).state;
    const merged = mergeGame(reached, server);
    expect(openGoal(merged)).toBeNull();
    expect(applyEvent(merged, lesson(8), DAY, opts).goalReached).toBe(0);
    // A new goal set later still wins over the reached one.
    const next = setStreakGoal(merged, 14, DAY);
    expect(openGoal(mergeGame(merged, next))?.target).toBe(14);
  });

  it("different purchases on two devices both cost coins", () => {
    const base = rich(200);
    const a = buy(base, "lamp-river", 0);
    const b = buy(base, "boost", 0);
    if (!a.ok || !b.ok) throw new Error("buy failed");
    const m = mergeGame(a.state, b.state);
    expect(coinBalance(m)).toBe(200 - 80 - 40);
    expect(m.owned).toEqual(["lamp-river"]);
    // The same lamp bought on both devices is paid once.
    expect(coinBalance(mergeGame(a.state, a.state))).toBe(120);
  });

  it("going back to the default lamp survives a sync", () => {
    const bought = buy(rich(), "lamp-river", 0);
    if (!bought.ok) throw new Error("buy failed");
    const local = equipLamp(bought.state, null);
    expect(mergeGame(local, bought.state).lamp).toBeNull();
  });

  it("caps speed-round coins per day", () => {
    let g = emptyGame();
    let paid = 0;
    for (let i = 0; i < 5; i++) {
      const r = applyEvent(g, { type: "speed", score: 400 }, DAY, opts);
      paid += r.coins;
      g = r.state;
    }
    expect(paid).toBe(SPEED_DAILY_COINS);
    expect(applyEvent(g, { type: "speed", score: 400 }, "2026-11-26", opts).coins).toBe(SPEED_MAX_COINS);
  });
});

describe("speed round", () => {
  const w = (id: string, en: string, letter = false): ReviewWord => ({ id, bn: id, tr: id, en, lesson: "u01-l01", lessonTitle: "", unit: "u01", unitTitle: "", letter });

  it("scores with a multiplier that grows every 4 in a row, capped at 4", () => {
    expect([0, 3, 4, 8, 12, 40].map(multiplier)).toEqual([1, 1, 2, 3, 4, 4]);
    expect(matchPoints(4)).toBe(20);
    expect(speedCoins(0)).toBe(0);
    expect(speedCoins(110)).toBe(5);
    expect(speedCoins(10_000)).toBe(SPEED_MAX_COINS);
  });

  it("draws only learned words, never letters, weakest first", () => {
    const words = [w("a", "water"), w("b", "rice"), w("c", "tea"), w("l-ka", "ka", true)];
    const learned = new Set(["a", "b", "l-ka"]);
    const pool = speedPool(words, learned, {}, 0, () => 0.5);
    expect(pool.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("skips a word that clashes with one on the board", () => {
    const queue = [w("a", "water"), w("b", "water (drink)"), w("c", "tea")];
    expect(nextWord(queue, 1, [queue[0]])).toBe(2);
    expect(nextWord(queue, 0, [])).toBe(0);
    expect(nextWord([queue[0]], 0, [queue[0]])).toBe(-1);
  });
});

describe("streak week", () => {
  const p = (over: Partial<ProgressState>): ProgressState => ({ ...EMPTY_PROGRESS, ...over });

  it("marks each of the last seven days", () => {
    const week = streakWeek(
      p({ streak: 3, lastActiveDate: "2026-11-24", daily: { "2026-11-21": 10, "2026-11-23": 10, "2026-11-24": 10 }, frozen: ["2026-11-22"] }),
      DAY,
    );
    expect(week.map((d) => d.day)).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(week.map((d) => d.mark)).toEqual(["none", "none", "done", "frozen", "done", "done", "today"]);
    expect(week.at(-1)?.label).toBe("Wed");
  });

  it("shows misses after the first activity", () => {
    const week = streakWeek(p({ streak: 1, lastActiveDate: "2026-11-25", daily: { "2026-11-20": 5, "2026-11-25": 5 } }), DAY);
    expect(week.map((d) => d.mark)).toEqual(["none", "done", "missed", "missed", "missed", "missed", "done"]);
  });
});
