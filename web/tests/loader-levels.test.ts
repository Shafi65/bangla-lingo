import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, generate, makeContent, readJson, writeJson, type Json } from "./helpers/pipeline-fixture";

// The content loader on throw-away content dirs (CONTENT_DIR), re-imported per dir.
afterAll(cleanup);
const ORIGINAL = process.env.CONTENT_DIR;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CONTENT_DIR;
  else process.env.CONTENT_DIR = ORIGINAL;
  vi.resetModules();
});

async function load(dir: string) {
  process.env.CONTENT_DIR = dir;
  vi.resetModules();
  const content = await import("@/lib/content");
  const translit = await import("@/lib/translit");
  return { ...content, translitFor: translit.translitFor };
}

describe("loader: levels, sections, scriptOnly", () => {
  it("passes level, section, sections and scriptOnly through", async () => {
    const dir = makeContent();
    expect(generate(dir, "i01-l01").code).toBe(0);
    const c = await load(dir);
    const course = c.getCourse();
    expect(course.source).toBe("content");
    expect(course.sections).toEqual([{ id: 1, title: "Foundations" }, { id: 2, title: "Going further" }]);
    expect(course.units.map((u) => [u.id, u.level, u.section])).toEqual([["u01-t", "beginner", 1], ["i01-t", "intermediate", 2]]);
    expect(c.getLesson("u01-l01")?.scriptOnly).toBeUndefined(); // beginner unit: unset
    expect(c.getLesson("i01-l01")?.scriptOnly).toBe(true); // unit default
    expect(c.getLesson("i01-l01")?.exercises.some((e) => e.type === "reading")).toBe(true);
  });

  it("a lesson's own scriptOnly beats the unit default; non-booleans are ignored", async () => {
    const dir = makeContent();
    generate(dir, "i01-l01");
    const base = readJson(dir, "units/i01-t/i01-l01.json");
    const course = readJson(dir, "course.json");
    const extra: [string, unknown][] = [["i01-l02", false], ["i01-l03", "yes"], ["i01-l04", true]];
    for (const [id, v] of extra) {
      writeJson(dir, `units/i01-t/${id}.json`, { ...base, id, scriptOnly: v });
      course.units[1].lessons.push(id);
    }
    writeJson(dir, "course.json", course);
    const c = await load(dir);
    expect(c.getLesson("i01-l02")?.scriptOnly).toBe(false);
    expect(c.getLesson("i01-l03")?.scriptOnly).toBe(true); // "yes" is not a boolean: the unit default applies
    expect(c.getLesson("i01-l04")?.scriptOnly).toBe(true);
  });

  it("a course with none of the new fields behaves as before: beginner, section 1, no sections, scriptOnly unset", async () => {
    const dir = makeContent((f) => {
      const course = f["course.json"] as Json;
      delete course.sections;
      course.units = [course.units[0]];
    });
    const c = await load(dir);
    const course = c.getCourse();
    expect(course.sections).toBeUndefined();
    expect(course.units.map((u) => [u.level, u.section])).toEqual([["beginner", 1]]);
    expect(c.getLesson("u01-l01")?.scriptOnly).toBeUndefined();
  });

  it("drops malformed sections and sanitises level and section values", async () => {
    const { parseSections, levelOf, sectionOf } = await load(makeContent());
    expect(parseSections(undefined)).toBeUndefined();
    expect(parseSections([])).toBeUndefined();
    expect(parseSections([{ id: 2, title: " B " }, { id: 1, title: "A" }, { id: 1, title: "dup" }, { id: "3", title: "x" }, { id: 4 }, { id: 0, title: "zero" }]))
      .toEqual([{ id: 1, title: "A" }, { id: 2, title: "B" }]);
    expect(levelOf({ level: "intermediate" })).toBe("intermediate");
    expect(levelOf({})).toBe("beginner");
    expect(levelOf({ level: "expert" as never })).toBe("beginner");
    expect(sectionOf({ section: 3 })).toBe(3);
    expect(sectionOf({})).toBe(1);
    expect(sectionOf({ section: -1 })).toBe(1);
    expect(sectionOf({ section: 1.5 })).toBe(1);
  });
});

describe("transliteration lookup knows assumed-known words", () => {
  it("resolves an assumed word that no lesson or lexicon entry mentions", async () => {
    const dir = makeContent(); // only the beginner lesson is authored, so these words can only come from assumed/bridge.json
    const c = await load(dir);
    const map = c.translitFor([{ id: "x", type: "select_translation", prompt: { bn: "x", tr: "x", en: "x" }, direction: "en_to_bn", options: ["সকাল", "যাই"], answer: 0 }]);
    expect(map["সকাল"]).toBe("shokal");
    expect(map["যাই"]).toBe("jai");
  });
});
