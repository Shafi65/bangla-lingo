import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildSteps, isStoryUnlocked, shuffledOrder } from "@/lib/stories/engine";
import { getStories, getStorySummaries } from "@/lib/stories/load";
import { buildFormIndex, segmentLine } from "@/lib/stories/segment";
import { STORIES_KEY, emptyStories, parseStories, recordFinish } from "@/lib/stories/storage";
import type { Gloss } from "@/lib/stories/types";

const g = (id: string, bn: string, tr: string, en: string): Gloss => ({ id, bn, tr, en });

describe("segmentLine", () => {
  const idx = buildFormIndex([
    g("ami", "আমি", "ami", "I"),
    g("bhat", "ভাত", "bhat", "rice"),
    g("khai", "খাই", "khai", "I eat"),
    g("thik-achhe", "ঠিক আছে", "thik achhe", "OK"),
    g("noy-isnt", "নয়", "noy", "is not"),
    g("noy-nine", "নয়", "noy", "nine"),
  ]);

  it("keeps punctuation outside the word and glosses every word", () => {
    const w = segmentLine("আমি ভাত খাই।", idx);
    expect(w.map((x) => [x.text, x.post])).toEqual([["আমি", ""], ["ভাত", ""], ["খাই", "।"]]);
    expect(w.every((x) => x.glosses.length === 1)).toBe(true);
  });

  it("joins a multi-word lexicon phrase into one tappable word", () => {
    const w = segmentLine("ঠিক আছে, আমি খাই!", idx);
    expect(w[0].text).toBe("ঠিক আছে");
    expect(w[0].post).toBe(",");
    expect(w[0].glosses[0].en).toBe("OK");
  });

  it("finds a word through a common ending", () => {
    const [w] = segmentLine("ভাতটা", idx);
    expect(w.glosses[0].id).toBe("bhat");
    expect(w.glosses[0].via).toContain("-টা");
  });

  it("uses senses to pick between homographs, else shows both", () => {
    expect(segmentLine("আমি নয়।", idx)[1].glosses.map((x) => x.id)).toEqual(["noy-isnt", "noy-nine"]);
    expect(segmentLine("আমি নয়।", idx, { "নয়": "noy-nine" })[1].glosses.map((x) => x.id)).toEqual(["noy-nine"]);
  });

  it("leaves an unknown word without a gloss", () => {
    expect(segmentLine("আমি কম্পিউটার", idx)[1].glosses).toEqual([]);
  });
});

describe("course stories", () => {
  const stories = getStories();

  it("has one story per main-track beginner unit from Unit 2 to Unit 15, in course order", () => {
    expect(stories.map((s) => s.unit)).toEqual([
      "u02-pronouns", "u03-family", "u04-food", "u05-numbers-time", "u06-bazaar", "u07-directions",
      "u08-daily-routine", "u09-past", "u10-culture", "u11-plans", "u12-have-to", "u13-requests", "u14-feelings-health", "u15-describing",
    ]);
    expect(stories.map((s) => s.unitNumber)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const s of stories) {
      expect(s.firstLessonId).toMatch(new RegExp(`^${s.unit.slice(0, 3)}-l01`));
      expect(s.lines.length).toBeGreaterThanOrEqual(6);
      expect(s.lines.length).toBeLessThanOrEqual(12);
    }
  });

  it("glosses every word of every line with exactly one meaning", () => {
    for (const s of stories)
      for (const l of s.lines)
        for (const w of l.words) {
          expect(w.glosses.length, `${s.id}: "${w.text}" in "${l.bn}"`).toBe(1);
          expect(w.glosses[0].via, `${s.id}: "${w.text}" found only through an ending`).toBeUndefined();
        }
  });

  it("summaries drop the lines but keep counts", () => {
    const sum = getStorySummaries();
    expect(sum).toHaveLength(stories.length);
    expect(sum[0]).not.toHaveProperty("lines");
    expect(sum[0].lineCount).toBe(stories[0].lines.length);
  });

  it("steps interleave each question after its line", () => {
    for (const s of stories) {
      const steps = buildSteps(s);
      expect(steps.filter((x) => x.kind === "line")).toHaveLength(s.lines.length);
      expect(steps.filter((x) => x.kind === "question")).toHaveLength(s.questions.length);
      steps.forEach((st, i) => {
        if (st.kind !== "question") return;
        const prev = steps.slice(0, i).filter((x) => x.kind === "line").pop();
        expect(prev).toEqual({ kind: "line", line: s.questions[st.question].after });
      });
    }
  });
});

describe("unlock, shuffle and storage", () => {
  it("unlocks on the unit's first lesson only", () => {
    expect(isStoryUnlocked({ firstLessonId: "u02-l01" }, {})).toBe(false);
    expect(isStoryUnlocked({ firstLessonId: "u02-l01" }, { "u02-l01": { completedAt: "x" } })).toBe(true);
    expect(isStoryUnlocked({ firstLessonId: null }, { "u02-l01": {} })).toBe(false);
  });

  it("shuffles to a permutation", () => {
    expect([...shuffledOrder(4, () => 0.3)].sort()).toEqual([0, 1, 2, 3]);
  });

  it("parses tolerantly and records best scores", () => {
    expect(STORIES_KEY).toBe("banglalingo.stories.v1");
    expect(parseStories("{nope")).toEqual(emptyStories());
    expect(parseStories(JSON.stringify({ v: 2, done: {} }))).toEqual(emptyStories());
    const a = recordFinish(emptyStories(), "s", 3, 4, new Date("2026-11-22T10:00:00Z"));
    const b = recordFinish(a, "s", 1, 4);
    expect(b.done.s).toMatchObject({ best: 3, last: 1, total: 4, times: 2 });
    expect(parseStories(JSON.stringify(b))).toEqual(b);
    expect(parseStories(JSON.stringify({ v: 1, done: { bad: { best: -1 } } })).done).toEqual({});
  });
});

// ---------------------------------------------------------------- validator
const SCRIPT = path.resolve(import.meta.dirname, "..", "..", "content", "scripts", "validate-stories.mjs");
const made: string[] = [];
afterAll(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const T = (bn: string, tr: string, en: string) => ({ bn, tr, en });
function tiny(story: Record<string, unknown>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-stories-"));
  made.push(dir);
  const w = (f: string, d: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(d));
  };
  w("course.json", {
    id: "t", title: "T",
    units: [
      { id: "u01-a", title: "A", track: "main", lessons: ["u01-l01"] },
      { id: "u02-b", title: "B", track: "main", lessons: ["u02-l01"] },
      { id: "u03-c", title: "C", track: "main", lessons: ["u03-l01"] },
    ],
  });
  const lex = (unit: string, lesson: string, e: [string, string, string, string][]) =>
    w(`lexicon/${unit}.json`, { unit, entries: e.map(([id, bn, tr, en]) => ({ id, bn, tr, en, pos: "noun", lesson })) });
  lex("u01-a", "u01-l01", [["ami", "আমি", "ami", "I"], ["bhalo", "ভালো", "bhalo", "good"], ["achhi", "আছি", "achhi", "am"], ["na", "না", "na", "no"]]);
  lex("u02-b", "u02-l01", [["tumi", "তুমি", "tumi", "you"], ["noy-isnt", "নয়", "noy", "is not"]]);
  lex("u03-c", "u03-l01", [["bhat", "ভাত", "bhat", "rice"], ["noy-nine", "নয়", "noy", "nine"]]);
  w("stories/u02-b-story.json", story);
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, CONTENT_DIR: dir }, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}
const line = T("আমি ভালো আছি।", "ami bhalo achhi.", "I am well.");
const good = () => ({
  id: "u02-b-story",
  unit: "u02-b",
  title: T("তুমি", "tumi", "You"),
  lines: [line, line, line, line, line, { speaker: "Rafi", ...T("তুমি ভালো নয়।", "tumi bhalo noy.", "You aren't good.") }],
  questions: [
    { after: 1, question: "How is he?", options: ["Well", "Ill"], answer: 0, why: "ভালো = good." },
    { after: 2, question: "Which is 'I'?", options: [T("আমি", "ami", "I"), T("তুমি", "tumi", "you")], answer: 0, why: "আমি = I." },
    { after: 5, question: "Is it?", options: ["No", "Yes"], answer: 0, why: "নয় = is not." },
  ],
});

describe("validate-stories.mjs", () => {
  it("passes the course's own stories", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/14 stories,.* 0 errors, 0 warnings/);
  });

  it("passes a small valid story (a later homograph does not count yet)", () => {
    const r = tiny(good());
    expect(r.code, r.out).toBe(0);
  });

  it("rejects words from a later unit, unknown words and wrong romanization", () => {
    const s = good();
    s.lines[0] = T("আমি ভাত।", "ami bhat.", "Me rice.");
    s.lines[1] = T("আমি কলা।", "ami kola.", "Me banana.");
    s.lines[2] = T("আমি ভালো আছি।", "ami valo achhi.", "I am well.");
    const r = tiny(s);
    expect(r.code).toBe(1);
    expect(r.out).toContain('"ভাত" is not taught yet');
    expect(r.out).toContain('"কলা" is not in content/lexicon/');
    expect(r.out).toContain('tr "ami valo achhi." does not match');
  });

  it("needs a mix of English and Bengali answers, line order and a why", () => {
    const s = good();
    s.questions[1] = { after: 0, question: "Again?", options: ["A", "B"], answer: 0, why: "" };
    const r = tiny(s);
    expect(r.code).toBe(1);
    expect(r.out).toContain("must be in line order");
    expect(r.out).toContain('missing "why"');
    expect(r.out).toContain("mix the questions");
  });

  it("rejects digits and Bengali quoted from a later unit in a why", () => {
    const s = good();
    s.lines[0] = T("আমি ৯", "ami 9", "I 9");
    s.questions[0].why = "ভাত = rice.";
    const r = tiny(s);
    expect(r.code).toBe(1);
    expect(r.out).toContain("has digits");
    expect(r.out).toContain('Bengali "ভাত" is not taught yet');
  });
});
