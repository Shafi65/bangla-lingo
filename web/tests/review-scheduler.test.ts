import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  LAPSE_STEP_MS,
  forgettingCurve,
  gradeFor,
  retrievability,
  schedule,
  strength,
  type WordRecord,
} from "@/lib/review";

const T0 = Date.UTC(2026, 2, 10, 12);

const rec = (over: Partial<WordRecord> = {}): WordRecord => ({
  id: "w",
  reps: 3,
  lapses: 0,
  stability: 10,
  difficulty: 5,
  due: T0,
  lastSeen: T0,
  run: 3,
  ...over,
});

describe("scheduler: correct answers", () => {
  it("first good answer starts at 1.5 days and is due then", () => {
    const a = schedule(undefined, "good", T0, "w");
    expect(a).toMatchObject({ id: "w", reps: 1, lapses: 0, run: 1, stability: 1.5, lastSeen: T0 });
    expect(a.due).toBe(T0 + Math.round(1.5 * DAY_MS));
  });

  it("on-time good reviews grow stability and push the due date out", () => {
    let r = schedule(undefined, "good", T0, "w");
    let now = T0;
    for (let i = 0; i < 4; i++) {
      now = r.due;
      const next = schedule(r, "good", now);
      expect(next.stability).toBeGreaterThan(r.stability);
      expect(next.due - now).toBeGreaterThan(r.due - r.lastSeen);
      expect(next.run).toBe(r.run + 1);
      r = next;
    }
    expect(r.stability).toBeGreaterThan(10);
  });

  it("a same-minute repeat adds almost nothing", () => {
    const a = schedule(undefined, "good", T0, "w");
    const b = schedule(a, "good", T0 + 60_000);
    expect(b.stability).toBeLessThan(a.stability * 1.02);
  });

  it("a late successful recall teaches more than an early one", () => {
    const a = schedule(undefined, "good", T0, "w");
    const early = schedule(a, "good", T0 + 0.1 * DAY_MS);
    const late = schedule(a, "good", T0 + 5 * DAY_MS);
    expect(late.stability).toBeGreaterThan(early.stability);
  });

  it("recall probability is 90% exactly one stability after the last review", () => {
    const r = rec({ stability: 7 });
    expect(retrievability(r, r.lastSeen + 7 * DAY_MS)).toBeCloseTo(0.9, 6);
    expect(forgettingCurve(0, 7)).toBe(1);
    expect(retrievability(undefined, T0)).toBe(0);
  });

  it("gradeFor maps correctness to good / again", () => {
    expect(gradeFor(true)).toBe("good");
    expect(gradeFor(false)).toBe("again");
  });
});

describe("scheduler: wrong answers", () => {
  it("lapse: counted, run reset, stability never grows, due in ~10 minutes", () => {
    const before = rec({ stability: 10, run: 5 });
    const now = T0 + 10 * DAY_MS;
    const after = schedule(before, "again", now);
    expect(after.lapses).toBe(1);
    expect(after.run).toBe(0);
    expect(after.lastWrong).toBe(now);
    expect(after.stability).toBeLessThan(before.stability);
    expect(after.due).toBe(now + LAPSE_STEP_MS);
    expect(LAPSE_STEP_MS).toBe(10 * 60_000);
  });

  it("a wrong first answer is due again in 10 minutes too", () => {
    const a = schedule(undefined, "again", T0, "w");
    expect(a).toMatchObject({ reps: 1, lapses: 1, run: 0 });
    expect(a.due).toBe(T0 + LAPSE_STEP_MS);
  });

  it("makes the word harder, and a correct answer afterwards restarts the run", () => {
    const r = rec({ difficulty: 5 });
    const wrong = schedule(r, "again", T0 + DAY_MS);
    expect(wrong.difficulty).toBeGreaterThan(r.difficulty);
    const again = schedule(wrong, "good", wrong.due);
    expect(again.run).toBe(1);
    expect(again.lastWrong).toBe(wrong.lastWrong);
  });

  it("survives the clock going backwards", () => {
    const r = rec({ lastSeen: T0 });
    const out = schedule(r, "good", T0 - DAY_MS);
    expect(Number.isFinite(out.stability)).toBe(true);
    expect(out.stability).toBeGreaterThanOrEqual(r.stability);
  });
});

describe("strength levels", () => {
  it("is weak for an unknown word", () => {
    expect(strength(undefined, T0)).toBe(1);
  });

  it("is set by stability when freshly seen", () => {
    expect(strength(rec({ stability: 0.5 }), T0)).toBe(1);
    expect(strength(rec({ stability: 1.5 }), T0)).toBe(2);
    expect(strength(rec({ stability: 6 }), T0)).toBe(3);
    expect(strength(rec({ stability: 30 }), T0)).toBe(4);
  });

  it("drops a level when overdue and to weak once mostly forgotten", () => {
    const strong = rec({ stability: 30, lastSeen: T0 });
    expect(strength(strong, T0 + 60 * DAY_MS)).toBe(3);
    expect(strength(strong, T0 + 400 * DAY_MS)).toBe(1);
  });

  it("a fresh word after one good answer is Fair", () => {
    expect(strength(schedule(undefined, "good", T0, "w"), T0)).toBe(2);
  });
});
