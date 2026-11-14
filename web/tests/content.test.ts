import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkResponse } from "@/lib/answers";
import {
  getAllLessonIds,
  getAllLessons,
  getContentBaseDir,
  getCourse,
  getLesson,
} from "@/lib/content";
import { translitFor } from "@/lib/translit";
import type { Exercise } from "@/lib/types";

const CONTENT = path.resolve(import.meta.dirname, "..", "..", "content");
const course = getCourse();
const lessons = getAllLessons();

describe("content loader (real ../content)", () => {
  it("loads the real course, not the fixture fallback", () => {
    expect(course.source).toBe("content");
    expect(path.resolve(getContentBaseDir())).toBe(CONTENT);
    expect(course.units.length).toBeGreaterThan(0);
  });

  it("every lesson listed in course.json resolves to a loaded lesson", () => {
    const def = JSON.parse(fs.readFileSync(path.join(CONTENT, "course.json"), "utf8")) as {
      units: { id: string; track: string; lessons: string[] }[];
    };
    const listed = def.units.flatMap((u) => u.lessons);
    const missing = listed.filter((id) => !getLesson(id));
    expect(missing).toEqual([]);
    expect(getAllLessonIds().sort()).toEqual([...listed].sort());
  });

  it("unit and lesson ids are unique", () => {
    const unitIds = course.units.map((u) => u.id);
    expect(new Set(unitIds).size).toBe(unitIds.length);
    const ids = course.units.flatMap((u) => u.lessons.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exercise ids are unique within each lesson", () => {
    for (const l of lessons) {
      const ids = l.exercises.map((e) => e.id);
      expect(new Set(ids).size, `duplicate exercise id in ${l.id}`).toBe(ids.length);
    }
  });

  it("summaries agree with lesson data", () => {
    for (const u of course.units) {
      for (const s of u.lessons) {
        const l = getLesson(s.id)!;
        expect(s.exerciseCount).toBe(l.exercises.length);
        expect(s.title).toBe(l.title ?? l.id);
      }
    }
  });

  it("returns undefined for unknown lessons", () => {
    expect(getLesson("does-not-exist")).toBeUndefined();
  });

  it("every Bengali item has bn, tr and en", () => {
    const bad: string[] = [];
    const chk = (where: string, t: { bn?: string; tr?: string; en?: string }) => {
      if (!t?.bn || !t?.tr || !t?.en) bad.push(where);
    };
    for (const l of lessons) {
      l.vocab.forEach((v, i) => chk(`${l.id} vocab[${i}]`, v));
      for (const e of l.exercises) {
        if ("prompt" in e) chk(`${l.id}/${e.id} prompt`, e.prompt);
        if (e.type === "listen_select") chk(`${l.id}/${e.id} audio`, e.audio);
        if (e.type === "match_pairs") e.pairs.forEach((p, i) => chk(`${l.id}/${e.id} pair${i}`, p));
      }
    }
    expect(bad).toEqual([]);
  });

  it("the authored answer of every exercise passes checkResponse", () => {
    const solve = (e: Exercise) => {
      switch (e.type) {
        case "select_translation":
        case "listen_select":
        case "script_recognize":
          return { kind: "index", value: e.answer } as const;
        case "word_bank":
          return { kind: "tiles", value: matchTiles(e.tiles, e.answer) } as const;
        case "type_translation":
          return { kind: "text", value: e.accepted[0] } as const;
        case "match_pairs":
          return { kind: "matched" } as const;
      }
    };
    const failures: string[] = [];
    for (const l of lessons)
      for (const e of l.exercises) if (!checkResponse(e, solve(e))) failures.push(`${l.id}/${e.id}`);
    expect(failures).toEqual([]);
  });
});

/** Map an answer word sequence to tile indices (handles repeated words). */
function matchTiles(tiles: string[], seq: string[]): number[] {
  const used = new Set<number>();
  return seq.map((w) => {
    const i = tiles.findIndex((t, k) => t === w && !used.has(k));
    used.add(i);
    return i;
  });
}

describe("transliteration lookup (translitFor)", () => {
  it("returns {} for no exercises", () => {
    expect(translitFor([])).toEqual({});
  });

  it("returns entries for Bengali options/tiles of real lessons", () => {
    const needing = lessons.flatMap((l) =>
      l.exercises.filter(
        (e) =>
          e.type === "listen_select" ||
          (e.type === "select_translation" && e.direction === "en_to_bn") ||
          (e.type === "word_bank" && e.direction === "en_to_bn"),
      ),
    );
    expect(needing.length).toBeGreaterThan(0);
    const map = translitFor(needing);
    expect(Object.keys(map).length).toBeGreaterThan(0);
    for (const [bn, tr] of Object.entries(map)) {
      expect(bn).toBe(bn.normalize("NFC"));
      expect(tr.length).toBeGreaterThan(0);
    }
  });

  it("u01-l01 listen_select options resolve to their lexicon transliteration", () => {
    const l = getLesson("u01-l01")!;
    const ls = l.exercises.filter((e) => e.type === "listen_select");
    expect(ls.length).toBeGreaterThan(0);
    const map = translitFor(ls);
    const vocab = new Map(l.vocab.map((v) => [v.bn.normalize("NFC"), v.tr]));
    let compared = 0;
    for (const e of ls) {
      if (e.type !== "listen_select") continue;
      for (const opt of e.options) {
        const key = opt.normalize("NFC");
        expect(map[key], `no translit for option ${opt}`).toBeTruthy();
        if (vocab.has(key)) {
          expect(map[key]).toBe(vocab.get(key));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("does not include English-direction options and ignores other exercise types", () => {
    const l = getLesson("u01-l01")!;
    const bnToEn = l.exercises.filter((e) => e.type === "select_translation" && e.direction === "bn_to_en");
    expect(translitFor(bnToEn)).toEqual({});
    expect(translitFor(l.exercises.filter((e) => e.type === "match_pairs" || e.type === "type_translation"))).toEqual({});
  });

  it("keys are the NFC form even for NFD input options", () => {
    const l = getLesson("u01-l01")!;
    const ls = l.exercises.find((e) => e.type === "listen_select");
    if (ls?.type !== "listen_select") throw new Error("fixture lesson changed");
    const nfd = { ...ls, options: ls.options.map((o) => o.normalize("NFD")) };
    const map = translitFor([nfd]);
    for (const o of ls.options) expect(map[o.normalize("NFC")]).toBeTruthy();
  });
});

describe("content validator", () => {
  it("node content/scripts/validate.mjs --strict exits 0", () => {
    const script = path.join(CONTENT, "scripts", "validate.mjs");
    try {
      execFileSync(process.execPath, [script, "--strict"], {
        cwd: path.resolve(CONTENT, ".."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      throw new Error(`validate --strict exited ${e.status}\n${e.stdout ?? ""}\n${e.stderr ?? ""}`);
    }
  });
});
