import { describe, expect, it } from "vitest";
import { hashOf } from "@/lib/reviewer/hash";
import {
  CORRUPT_KEY,
  emptyState,
  itemStatus,
  currentVerdict,
  lessonProgress,
  loadState,
  mergeStates,
  parseState,
  saveState,
  setReviewer,
  STORAGE_KEY,
  updateItem,
  updateOverall,
  type StorageLike,
} from "@/lib/reviewer/storage";
import { buildTargets } from "@/lib/reviewer/targets";
import type { Lesson } from "@/lib/types";

function fakeStorage(initial: Record<string, string> = {}, failWrites = false): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (failWrites) throw new Error("QuotaExceededError");
      data[k] = v;
    },
  };
}

const meta = (hash = "h1", seq = 1) => ({ hash, text: "আমি", seq });
const T0 = "2026-11-18T10:00:00.000Z";
const T1 = "2026-11-18T11:00:00.000Z";

const lesson: Lesson = {
  id: "x-l01",
  unit: "x",
  title: "X",
  tip: "Use **আপনি** politely.",
  vocab: [{ id: "ami", bn: "আমি", tr: "ami", en: "I" }],
  exercises: [
    { id: "e01", type: "select_translation", prompt: { bn: "আমি", tr: "ami", en: "I" }, direction: "bn_to_en", options: ["I", "you"], answer: 0 },
    { id: "e02", type: "type_translation", prompt: { bn: "তুমি", tr: "tumi", en: "you" }, direction: "bn_to_en", accepted: ["you"] },
  ],
};

describe("reviewer storage", () => {
  it("saves and loads under one key", () => {
    const st = fakeStorage();
    let s = updateItem(emptyState(), "x-l01", "e01", meta(), { verdict: "ok" }, T0);
    s = setReviewer(s, "Rina");
    expect(saveState(s, st)).toBe(true);
    expect(Object.keys(st.data)).toEqual([STORAGE_KEY]);
    const back = loadState(st);
    expect(back.reviewer).toBe("Rina");
    expect(back.lessons["x-l01"].items.e01).toMatchObject({ verdict: "ok", hash: "h1", text: "আমি", updated: T0 });
  });

  it("is safe without storage and when writes fail", () => {
    expect(loadState(null)).toEqual(emptyState());
    expect(saveState(emptyState(), null)).toBe(false);
    expect(saveState(emptyState(), fakeStorage({}, true))).toBe(false);
  });

  it("a comment-only note is kept; clearing everything removes the entry", () => {
    let s = updateItem(emptyState(), "l", "e01", meta(), { comment: "odd word" }, T0);
    expect(s.lessons.l.items.e01.verdict).toBeUndefined();
    expect(s.lessons.l.items.e01.comment).toBe("odd word");
    s = updateItem(s, "l", "e01", meta(), { comment: "" }, T1);
    expect(s.lessons.l.items.e01).toBeUndefined();
  });

  it("detects a changed exercise by hash", () => {
    const [, , e01] = buildTargets(lesson);
    let s = updateItem(emptyState(), lesson.id, e01.key, { hash: e01.hash, text: e01.text, seq: e01.seq }, { verdict: "ok" }, T0);
    const entry = s.lessons[lesson.id].items.e01;
    expect(itemStatus(entry, e01.hash)).toBe("current");
    expect(currentVerdict(entry, e01.hash)).toBe("ok");

    const edited: Lesson = { ...lesson, exercises: [{ ...lesson.exercises[0], options: ["I", "we"] } as Lesson["exercises"][0], lesson.exercises[1]] };
    const e01b = buildTargets(edited).find((t) => t.key === "e01")!;
    expect(e01b.hash).not.toBe(e01.hash);
    expect(itemStatus(entry, e01b.hash)).toBe("changed");
    expect(currentVerdict(entry, e01b.hash)).toBeUndefined();
    expect(lessonProgress(s, lesson.id, buildTargets(edited)).changed).toBe(1);

    // Editing a comment must not hide the change; giving a verdict again re-baselines.
    s = updateItem(s, lesson.id, "e01", { hash: e01b.hash, text: e01b.text, seq: e01b.seq }, { comment: "still fine?" }, T1);
    expect(itemStatus(s.lessons[lesson.id].items.e01, e01b.hash)).toBe("changed");
    s = updateItem(s, lesson.id, "e01", { hash: e01b.hash, text: e01b.text, seq: e01b.seq }, { verdict: "ok" }, T1);
    expect(itemStatus(s.lessons[lesson.id].items.e01, e01b.hash)).toBe("current");
  });

  it("hashes ignore key order but not content", () => {
    expect(hashOf({ a: 1, b: ["x", { c: 2, d: 3 }] })).toBe(hashOf({ b: ["x", { d: 3, c: 2 }], a: 1 }));
    expect(hashOf({ a: "আমি" })).not.toBe(hashOf({ a: "আপনি" }));
    expect(hashOf("é")).toBe(hashOf("é"));
  });

  it("builds tip, vocab and exercise targets; a Kolkata variant change flags the vocab row", () => {
    const a = buildTargets(lesson);
    expect(a.map((t) => t.key)).toEqual(["tip", "vocab:ami", "e01", "e02"]);
    expect(a[0].text).toBe("আপনি");
    expect(a[2].text).toBe("আমি");
    const b = buildTargets(lesson, { ami: { bn: "আমি", tr: "ami" } });
    expect(b[1].hash).not.toBe(a[1].hash);
    expect(b[2].hash).toBe(a[2].hash);
  });

  it("recovers from corrupt data and keeps the corrupt text aside", () => {
    const st = fakeStorage({ [STORAGE_KEY]: "{not json" });
    expect(loadState(st)).toEqual(emptyState());
    expect(st.data[CORRUPT_KEY]).toBe("{not json");
    expect(loadState(fakeStorage({ [STORAGE_KEY]: "null" }))).toEqual(emptyState());
    expect(loadState(fakeStorage({ [STORAGE_KEY]: "[1,2]" }))).toEqual(emptyState());
  });

  it("sanitises malformed content instead of trusting it", () => {
    const s = parseState({
      reviewer: 42,
      lessons: {
        a: { items: { e1: { verdict: "bogus", comment: "c", hash: 5, seq: "x" }, e2: "nope", e3: { verdict: "ok", hash: "h" } }, overall: { rating: 9, comment: "" } },
        b: "junk",
        __proto__: { items: { x: { verdict: "ok" } } },
      },
    });
    expect(s.reviewer).toBe("");
    expect(Object.keys(s.lessons)).toEqual(["a"]);
    expect(s.lessons.a.items.e1).toMatchObject({ comment: "c", hash: "", seq: 0 });
    expect(s.lessons.a.items.e1.verdict).toBeUndefined();
    expect(s.lessons.a.items.e2).toBeUndefined();
    expect(s.lessons.a.items.e3.verdict).toBe("ok");
    expect(s.lessons.a.overall).toBeUndefined();
    expect(({} as { items?: unknown }).items).toBeUndefined();
  });

  it("counts progress per lesson", () => {
    const targets = buildTargets(lesson);
    let s = emptyState();
    for (const [i, t] of targets.entries()) {
      s = updateItem(s, lesson.id, t.key, { hash: t.hash, text: t.text, seq: t.seq }, { verdict: i === 2 ? "needs_change" : i === 3 ? "unsure" : "ok" }, T0);
    }
    s = updateOverall(s, lesson.id, { rating: 4, comment: "reads well" }, T0);
    const p = lessonProgress(s, lesson.id, targets);
    expect(p).toMatchObject({ total: 4, reviewed: 4, ok: 2, needsChange: 1, unsure: 1, status: "done", flagged: true, rating: 4, comments: 1 });
    expect(lessonProgress(emptyState(), lesson.id, targets).status).toBe("unreviewed");
  });

  it("merges by newest edit", () => {
    const a = updateItem(emptyState(), "l", "e1", meta(), { verdict: "ok" }, T1);
    const b0 = updateItem(emptyState(), "l", "e1", meta(), { verdict: "needs_change", correction: "fix" }, T0);
    const b = updateItem(b0, "l", "e2", meta(), { verdict: "unsure" }, T0);
    const { state, taken } = mergeStates(setReviewer(a, ""), setReviewer(b, "Karim"));
    expect(taken).toBe(1);
    expect(state.reviewer).toBe("Karim");
    expect(state.lessons.l.items.e1.verdict).toBe("ok");
    expect(state.lessons.l.items.e2.verdict).toBe("unsure");
  });
});
