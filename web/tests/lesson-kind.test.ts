import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse, readPlanKinds } from "@/lib/content";
import { isReviewLesson } from "@/lib/lessonKind";

const PLANS = path.resolve(import.meta.dirname, "..", "..", "content", "plans");

describe("lesson kind loading", () => {
  const lessons = getCourse().units.flatMap((u) => u.lessons);

  it("every lesson summary has a kind", () => {
    for (const l of lessons) expect(["lesson", "review", "checkpoint"]).toContain(l.kind);
  });

  it("matches the plan files: planned reviews are reviews, everything else is a lesson", () => {
    const planned = new Map<string, string>();
    for (const f of fs.readdirSync(PLANS).filter((n) => n.endsWith(".json"))) {
      const plan = JSON.parse(fs.readFileSync(path.join(PLANS, f), "utf8")) as { lessons: { id: string; kind?: string }[] };
      for (const l of plan.lessons) planned.set(l.id, l.kind ?? "lesson");
    }
    const reviews = [...planned].filter(([, k]) => k === "review").map(([id]) => id);
    expect(reviews.length).toBeGreaterThan(0);
    for (const l of lessons) expect(l.kind, l.id).toBe(planned.get(l.id) ?? "lesson");
    for (const id of reviews) expect(lessons.find((l) => l.id === id)?.kind).toBe("review");
  });

  it("readPlanKinds skips missing plans, unknown kinds and malformed entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kinds-"));
    fs.mkdirSync(path.join(dir, "plans"));
    fs.writeFileSync(
      path.join(dir, "plans", "u1.json"),
      JSON.stringify({ lessons: [{ id: "a", kind: "review" }, { id: "b", kind: "checkpoint" }, { id: "c" }, { id: "d", kind: "weird" }, null, { kind: "review" }] }),
    );
    fs.writeFileSync(path.join(dir, "plans", "bad.json"), "{nope");
    expect([...readPlanKinds(dir, "u1")]).toEqual([["a", "review"], ["b", "checkpoint"]]);
    expect(readPlanKinds(dir, "bad").size).toBe(0);
    expect(readPlanKinds(dir, "missing").size).toBe(0);
  });

  it("isReviewLesson uses kind first and the title only as a fallback", () => {
    expect(isReviewLesson({ kind: "review", title: "Mixed bag" })).toBe(true);
    expect(isReviewLesson({ kind: "checkpoint", title: "Review: x" })).toBe(false);
    expect(isReviewLesson({ kind: "lesson", title: "Review: greetings" })).toBe(true);
    expect(isReviewLesson({ title: "Review 1" })).toBe(true);
    expect(isReviewLesson({ kind: "lesson", title: "Hello" })).toBe(false);
  });
});
