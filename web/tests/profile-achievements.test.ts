import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_IDS, achievements, type ProfileStats } from "@/lib/profile";

const BASE: ProfileStats = {
  xp: 0,
  streak: 0,
  bestStreak: 0,
  wordsLearned: 0,
  lessonsCompleted: 0,
  daysActive: 0,
  perfectLessons: 0,
  reviewed: false,
  units: [
    { id: "u1", label: "Unit 1", title: "Basics", track: "main", done: 0, total: 5 },
    { id: "s1", label: "Script 1", title: "Vowels", track: "script", done: 0, total: 4 },
  ],
  unitsFinished: 0,
  scriptComplete: false,
  scriptDone: 0,
  scriptTotal: 4,
  strength: { 1: 0, 2: 0, 3: 0, 4: 0 },
  isNew: true,
};

const byId = (s: ProfileStats) => Object.fromEntries(achievements(s).map((a) => [a.id, a]));

describe("achievements", () => {
  it("lists every achievement locked for a new learner, with what is needed", () => {
    const list = achievements(BASE);
    expect(list.map((a) => a.id)).toEqual(ACHIEVEMENT_IDS);
    expect(list.length).toBeGreaterThanOrEqual(15);
    expect(list.every((a) => !a.earned)).toBe(true);
    const a = byId(BASE);
    expect(a["streak-7"].progressText).toBe("0 of 7 days");
    expect(a["first-lesson"].progressText).toBe("0 of 1 lesson");
    expect(a["xp-1000"].progressText).toBe("0 of 1,000 XP");
    expect(a["unit-done"].progressText).toBe("No unit started yet");
    expect(a["script-done"].progressText).toBe("0 of 4 script lessons");
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
  });

  it("earns thresholds at exactly the target and caps progress", () => {
    const a = byId({ ...BASE, xp: 500, bestStreak: 7, wordsLearned: 49, lessonsCompleted: 12 });
    expect(a["xp-100"].earned).toBe(true);
    expect(a["xp-500"].earned).toBe(true);
    expect(a["xp-1000"]).toMatchObject({ earned: false, value: 500, target: 1000 });
    expect(a["streak-3"].earned && a["streak-7"].earned).toBe(true);
    expect(a["streak-30"].progressText).toBe("7 of 30 days");
    expect(a["words-50"]).toMatchObject({ earned: false, progressText: "49 of 50 words" });
    expect(a["lessons-10"]).toMatchObject({ earned: true, value: 10 });
    expect(a["first-lesson"].earned).toBe(true);
  });

  it("handles perfect lessons, reviews, units and the script track", () => {
    const s: ProfileStats = {
      ...BASE,
      perfectLessons: 1,
      reviewed: true,
      unitsFinished: 1,
      scriptDone: 4,
      scriptComplete: true,
    };
    const a = byId(s);
    expect(a.perfect.earned).toBe(true);
    expect(a["first-review"].earned).toBe(true);
    expect(a["unit-done"].earned).toBe(true);
    expect(a["script-done"]).toMatchObject({ earned: true, value: 4, target: 4 });
  });

  it("points a locked unit badge at the closest unit", () => {
    const s: ProfileStats = {
      ...BASE,
      units: [
        { id: "u1", label: "Unit 1", title: "Basics", track: "main", done: 2, total: 5 },
        { id: "s1", label: "Script 1", title: "Vowels", track: "script", done: 3, total: 4 },
      ],
      scriptDone: 3,
    };
    expect(byId(s)["unit-done"].progressText).toBe("Vowels: 3 of 4 lessons");
    expect(byId(s)["script-done"]).toMatchObject({ earned: false, progressText: "3 of 4 script lessons" });
  });

  it("never earns the script badge when the course has no script lessons", () => {
    expect(byId({ ...BASE, scriptTotal: 0 })["script-done"].earned).toBe(false);
  });
});
