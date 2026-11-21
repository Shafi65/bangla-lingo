import { describe, expect, it } from "vitest";
import { buildSets, completedUnitIds, RECENT_LIMIT, type SpeakData, type SpeakItem } from "@/lib/speak/items";
import type { LessonRecord } from "@/lib/progress";

const item = (bn: string, l: number): SpeakItem => ({ bn, tr: bn, en: bn, clip: `${bn}.mp3`, l });
const rec = (completedAt: string, placed = false): LessonRecord => ({
  completedAt,
  bestAccuracy: placed ? 0 : 0.9,
  timesCompleted: placed ? 0 : 1,
  ...(placed ? { placed: true as const } : {}),
});

const data: SpeakData = {
  lessons: ["a1", "a2", "b1", "b2", "c1"],
  units: [
    { id: "a", title: "Unit A", lessons: [0, 1] },
    { id: "b", title: "Unit B", lessons: [2, 3] },
    { id: "c", title: "Unit C", lessons: [4] },
  ],
  items: [item("x1", 0), item("x2", 0), item("y1", 1), item("z1", 2), item("w1", 4)],
};

describe("completedUnitIds", () => {
  it("needs every lesson of the unit played", () => {
    expect(completedUnitIds(data, { a1: rec("2026-01-01") })).toEqual([]);
    expect(completedUnitIds(data, { a1: rec("2026-01-01"), a2: rec("2026-01-02"), c1: rec("2026-01-03") })).toEqual(["a", "c"]);
  });
  it("does not count placed lessons", () => {
    expect(completedUnitIds(data, { c1: rec("2026-01-03", true) })).toEqual([]);
  });
});

describe("buildSets", () => {
  it("is empty with no progress", () => {
    expect(buildSets(data, {})).toEqual([]);
  });

  it("puts 'Recently learned' first, then one set per completed unit in course order", () => {
    const sets = buildSets(data, { a1: rec("2026-01-01"), a2: rec("2026-01-02"), c1: rec("2026-01-05") });
    expect(sets.map((s) => s.id)).toEqual(["recent", "a", "c"]);
    expect(sets[1].items.map((i) => i.bn)).toEqual(["x1", "x2", "y1"]);
  });

  it("orders recent by lesson recency (newest lesson first)", () => {
    const sets = buildSets(data, { a1: rec("2026-01-01"), a2: rec("2026-01-02"), c1: rec("2026-01-05") });
    expect(sets[0].items.map((i) => i.bn)).toEqual(["w1", "y1", "x1", "x2"]);
  });

  it("offers recent items for a lesson in an unfinished unit, but no unit set", () => {
    const sets = buildSets(data, { b1: rec("2026-02-01") });
    expect(sets.map((s) => s.id)).toEqual(["recent"]);
    expect(sets[0].items.map((i) => i.bn)).toEqual(["z1"]);
  });

  it("ignores placed lessons", () => {
    expect(buildSets(data, { a1: rec("2026-01-01", true) })).toEqual([]);
  });

  it("caps recent at RECENT_LIMIT items", () => {
    const many: SpeakData = {
      lessons: ["l1", "l2"],
      units: [{ id: "u", title: "U", lessons: [0, 1] }],
      items: Array.from({ length: 30 }, (_, i) => item(`s${i}`, i < 15 ? 0 : 1)),
    };
    const sets = buildSets(many, { l1: rec("2026-01-01"), l2: rec("2026-01-02") });
    expect(sets[0].items).toHaveLength(RECENT_LIMIT);
    expect(sets[1].items).toHaveLength(30);
  });

  it("skips units whose lessons have no clipped items", () => {
    const sets = buildSets(data, { b2: rec("2026-01-01") });
    expect(sets).toEqual([]);
    const d2 = { ...data, units: [...data.units] };
    expect(buildSets(d2, { a1: rec("2026-01-01"), a2: rec("2026-01-01"), b1: rec("2026-01-01"), b2: rec("2026-01-01") }).map((s) => s.id)).toEqual(["recent", "a", "b"]);
  });
});
