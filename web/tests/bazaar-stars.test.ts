import { describe, expect, it } from "vitest";
import { loadBazaar } from "@/lib/bazaar/load";
import { optionOrder, scoreStall } from "@/lib/bazaar/engine";
import { getCourse, getLesson } from "@/lib/content";
import { layoutSky, starDue, starLevel } from "@/lib/stars/sky";
import { buildWriteGroups } from "@/lib/write/letters";

describe("bazaar", () => {
  const bank = loadBazaar()!;

  it("loads the shipped stalls", () => {
    expect(bank).not.toBeNull();
    expect(bank.stalls.length).toBeGreaterThanOrEqual(3);
  });

  it("pays coins per right step plus a bonus for a successful haggle", () => {
    const mango = bank.stalls.find((s) => s.id === "mangoes")!;
    const all = scoreStall(bank, mango, mango.steps.map(() => true));
    expect(all.paid).toBe(80);
    expect(all.saved).toBe(20);
    expect(all.coins).toBe(mango.steps.length * bank.coinsPerStep + bank.haggleBonus);
    const noHaggle = scoreStall(bank, mango, [true, true, false]);
    expect(noHaggle.paid).toBe(100);
    expect(noHaggle.saved).toBe(0);
    expect(noHaggle.coins).toBe(2 * bank.coinsPerStep);
  });

  it("does not count a quantity change as savings", () => {
    const veg = bank.stalls.find((s) => s.id === "vegetables")!;
    const r = scoreStall(bank, veg, veg.steps.map(() => true));
    expect(r.paid).toBe(25);
    expect(r.saved).toBe(0);
  });

  it("shuffles options stably and not always with the answer first", () => {
    expect(optionOrder("mangoes", 0, 3)).toEqual(optionOrder("mangoes", 0, 3));
    expect([...optionOrder("x", 1, 3)].sort()).toEqual([0, 1, 2]);
    const firsts = bank.stalls.flatMap((s) => s.steps.map((st, i) => optionOrder(s.id, i, st.kind === "listen" ? st.choices.length : st.options.length)[0]));
    expect(new Set(firsts).size).toBeGreaterThan(1);
  });
});

describe("letter sky", () => {
  const units = getCourse().units.filter((u) => u.track === "script");
  const groups = buildWriteGroups(
    units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons.map((l) => l.id) })),
    getLesson,
  );

  it("places every letter once, inside the sky", () => {
    const { constellations, height } = layoutSky(groups);
    const stars = constellations.flatMap((c) => c.stars);
    expect(stars.length).toBe(groups.flatMap((g) => g.lessons.flatMap((l) => l.letters)).length);
    expect(new Set(stars.map((s) => s.letter.id)).size).toBe(stars.length);
    for (const s of stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(360);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(height);
    }
    expect(layoutSky(groups)).toEqual(layoutSky(groups));
  });

  it("brightens with lessons, tracing, writing and memory", () => {
    const now = 1_800_000_000_000;
    const rec = (stability: number, due = now + 1e9) => ({ id: "l-ka", reps: 3, lapses: 0, stability, difficulty: 5, due, lastSeen: now - 1000, run: 2 });
    expect(starLevel({ lessonDone: false, write: "new", memory: undefined, now })).toBe(0);
    expect(starLevel({ lessonDone: true, write: "new", memory: undefined, now })).toBe(1);
    expect(starLevel({ lessonDone: true, write: "traced", memory: undefined, now })).toBe(2);
    expect(starLevel({ lessonDone: true, write: "written", memory: undefined, now })).toBe(3);
    expect(starLevel({ lessonDone: true, write: "new", memory: rec(30), now })).toBe(3);
    expect(starDue(rec(2, now - 1), now)).toBe(true);
    expect(starDue(undefined, now)).toBe(false);
  });
});
