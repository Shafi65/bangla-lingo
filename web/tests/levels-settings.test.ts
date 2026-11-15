// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { sectionsOf } from "@/lib/courseSections";
import { DEFAULT_SETTINGS, LocalStorageProgressStore, sanitizeSettings } from "@/lib/progress";
import { resolveTranslitVisibility } from "@/lib/translitVisibility";
import type { CourseSummary, UnitSummary } from "@/lib/types";

const KEY = "banglalingo.progress.v1";

describe("alwaysRomanize setting", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to off", () => {
    expect(DEFAULT_SETTINGS.alwaysRomanize).toBe(false);
    expect(new LocalStorageProgressStore().get().settings.alwaysRomanize).toBe(false);
  });
  it("sanitises: only booleans are kept", () => {
    expect(sanitizeSettings({ alwaysRomanize: true }).alwaysRomanize).toBe(true);
    expect(sanitizeSettings({ alwaysRomanize: false }).alwaysRomanize).toBe(false);
    for (const junk of ["yes", 1, null, undefined, {}, []]) {
      expect(sanitizeSettings({ alwaysRomanize: junk }).alwaysRomanize).toBe(false);
    }
  });
  it("an old save without the field gets the default and keeps its other settings", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, settings: { translit: "hidden", dailyGoal: 50 } }));
    expect(new LocalStorageProgressStore().get().settings).toEqual({ ...DEFAULT_SETTINGS, translit: "hidden", dailyGoal: 50 });
  });
  it("updateSettings persists it and leaves the rest alone", () => {
    const store = new LocalStorageProgressStore();
    store.updateSettings({ alwaysRomanize: true });
    expect(store.get().settings).toEqual({ ...DEFAULT_SETTINGS, alwaysRomanize: true });
    expect(new LocalStorageProgressStore().get().settings.alwaysRomanize).toBe(true);
    store.updateSettings({ dailyGoal: 30 });
    expect(store.get().settings.alwaysRomanize).toBe(true);
    store.updateSettings({ alwaysRomanize: "nope" as unknown as boolean });
    expect(store.get().settings.alwaysRomanize).toBe(false);
  });
});

describe("resolveTranslitVisibility", () => {
  const scriptIds = ["s1", "s2"];
  const none = {};
  const settings = (translit: "always" | "auto" | "hidden", alwaysRomanize = false) => ({ translit, alwaysRomanize });

  it("keeps the normal rules outside script-only lessons", () => {
    expect(resolveTranslitVisibility(settings("always"), scriptIds, { s1: 1, s2: 1 }, false)).toBe("show");
    expect(resolveTranslitVisibility(settings("hidden"), scriptIds, none, false)).toBe("reveal");
    expect(resolveTranslitVisibility(settings("auto"), scriptIds, none, false)).toBe("show");
    expect(resolveTranslitVisibility(settings("auto"), scriptIds, { s1: 1 }, false)).toBe("faded");
    expect(resolveTranslitVisibility(settings("auto"), scriptIds, { s1: 1, s2: 1 }, false)).toBe("reveal");
    expect(resolveTranslitVisibility(settings("auto"), [], none, false)).toBe("show");
  });
  it("script-only lessons reveal on tap whatever always/fade says", () => {
    for (const mode of ["always", "auto", "hidden"] as const) {
      for (const completed of [none, { s1: 1 }, { s1: 1, s2: 1 }]) {
        expect(resolveTranslitVisibility(settings(mode), scriptIds, completed, true)).toBe("reveal");
      }
    }
    expect(resolveTranslitVisibility(settings("auto"), [], none, true)).toBe("reveal");
  });
  it("'Always show romanization' restores the normal rules in script-only lessons", () => {
    expect(resolveTranslitVisibility(settings("always", true), scriptIds, { s1: 1, s2: 1 }, true)).toBe("show");
    expect(resolveTranslitVisibility(settings("auto", true), scriptIds, { s1: 1 }, true)).toBe("faded");
    expect(resolveTranslitVisibility(settings("hidden", true), scriptIds, none, true)).toBe("reveal");
  });
});

describe("sectionsOf (course map grouping)", () => {
  const unit = (id: string, track: "main" | "script", extra: Partial<UnitSummary> = {}): UnitSummary => ({
    id, title: id.toUpperCase(), track, lessons: [{ id: `${id}-l1`, title: "L", kind: "lesson", exerciseCount: 1, draft: false }], ...extra,
  });
  const course = (units: UnitSummary[], sections?: CourseSummary["sections"]): CourseSummary => ({
    id: "c", title: "C", source: "content", units, ...(sections ? { sections } : {}),
  });

  it("without sections it derives them as before: main units up to and including the next script unit", () => {
    const s = sectionsOf(course([unit("u1", "main"), unit("s1", "script"), unit("u2", "main"), unit("u3", "main"), unit("s2", "script"), unit("u4", "main")]));
    expect(s.map((x) => ({ n: x.n, title: x.title, units: x.units.map((u) => u.label) }))).toEqual([
      { n: 1, title: undefined, units: ["Unit 1", "Script 1"] },
      { n: 2, title: undefined, units: ["Unit 2", "Unit 3", "Script 2"] },
      { n: 3, title: undefined, units: ["Unit 4"] },
    ]);
  });
  it("with sections it groups units by section (missing = 1) under the section titles, in section order", () => {
    const s = sectionsOf(
      course(
        [unit("u1", "main"), unit("s1", "script", { section: 1 }), unit("i1", "main", { level: "intermediate", section: 2 }), unit("i2", "main", { level: "intermediate", section: 2 })],
        [{ id: 1, title: "Foundations" }, { id: 2, title: "Going further" }],
      ),
    );
    expect(s.map((x) => [x.n, x.title, x.units.map((u) => u.unit.id)])).toEqual([
      [1, "Foundations", ["u1", "s1"]],
      [2, "Going further", ["i1", "i2"]],
    ]);
  });
  it("numbers main units per level so intermediate units restart at Unit 1", () => {
    const s = sectionsOf(course([unit("u1", "main"), unit("u2", "main"), unit("i1", "main", { level: "intermediate", section: 2 })], [{ id: 1, title: "A" }, { id: 2, title: "B" }]));
    expect(s.flatMap((x) => x.units.map((u) => u.label))).toEqual(["Unit 1", "Unit 2", "Unit 1"]);
  });
  it("leaves out empty sections and puts units of unlisted sections in the first one", () => {
    const s = sectionsOf(course([unit("u1", "main"), unit("u2", "main", { section: 9 })], [{ id: 1, title: "A" }, { id: 2, title: "Empty" }]));
    expect(s.map((x) => [x.title, x.units.map((u) => u.unit.id)])).toEqual([["A", ["u1", "u2"]]]);
  });
});
