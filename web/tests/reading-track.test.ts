// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { checkpointIds, checkpointSpan, canTestOut, readingCheckpointIds, testOutInfo, testOutOffer } from "@/lib/checkpoint";
import { numberUnits } from "@/lib/courseSections";
import { unitLabel } from "@/lib/placement/engine";
import { lessonStates, type ProgressState } from "@/lib/progress";
import type { CourseSummary, LessonKind, UnitSummary } from "@/lib/types";

const lesson = (id: string, kind: LessonKind = "lesson") => ({ id, title: id, kind, exerciseCount: 10, draft: false });
const unit = (id: string, ids: string[], extra: Partial<UnitSummary> = {}): UnitSummary => ({
  id,
  title: id,
  track: "main",
  lessons: ids.map((i) => lesson(i, i.endsWith("cp") ? "checkpoint" : "lesson")),
  ...extra,
});
const INT = { level: "intermediate" as const };
const READ = { level: "intermediate" as const, strand: "reading" as const };
const COURSE: CourseSummary = {
  id: "c",
  title: "C",
  source: "fixture",
  units: [
    unit("u1", ["a1", "a-cp"]),
    unit("i00-bridge", ["b1"], INT),
    unit("i01-x", ["i1", "i-cp"], INT),
    unit("r01-signs", ["r1", "r2", "r-cp"], READ),
    unit("r02-forms", ["q1", "q-cp"], READ),
  ],
};

describe("reading track", () => {
  it("numbers reading units from their r## id, apart from Unit and Intermediate numbering", () => {
    expect(numberUnits(COURSE).map((n) => n.label)).toEqual(["Unit 1", "Bridge", "Unit 1", "Reading 1", "Reading 2"]);
  });
  it("keeps a reading unit's first lesson open without finishing the I-track", () => {
    const p = { completed: {} } as unknown as ProgressState;
    expect(lessonStates(COURSE.units[3], p)).toEqual(["unlocked", "locked", "locked"]);
  });
  it("a reading checkpoint covers only reading-track lessons; an I-track checkpoint never reaches into them", () => {
    expect(checkpointSpan(COURSE, "r-cp")?.lessonIds).toEqual(["r1", "r2", "r-cp"]);
    expect(checkpointSpan(COURSE, "r-cp")?.label).toBe("Reading 1");
    expect(checkpointSpan(COURSE, "q-cp")?.lessonIds).toEqual(["q1", "q-cp"]);
    expect(checkpointSpan(COURSE, "i-cp")?.lessonIds).toEqual(["b1", "i1", "i-cp"]);
  });
  it("keeps reading checkpoints in their own test-out order", () => {
    expect(checkpointIds(COURSE)).toEqual(["a-cp", "i-cp"]);
    expect(readingCheckpointIds(COURSE)).toEqual(["r-cp", "q-cp"]);
    const info = testOutInfo(COURSE, "r-cp");
    expect(info?.order).toEqual(["r-cp", "q-cp"]);
    // tested out independently of the unfinished main-track checkpoints
    expect(canTestOut(info!.order, {}, "r-cp")).toBe(true);
    expect(testOutInfo(COURSE, "i-cp")?.order).toEqual(["a-cp", "i-cp"]);
  });
  it("offers the reading test-out once the reading track has been started", () => {
    const rec = { at: 1, bestAccuracy: 1 } as never;
    expect(testOutOffer(COURSE, {})?.id).toBe("a-cp");
    expect(testOutOffer(COURSE, { r1: rec })?.id).toBe("r-cp");
  });
  it("labels reading units for placement", () => {
    const units = COURSE.units.map((u) => ({ id: u.id, title: u.title, track: u.track, level: u.level ?? ("beginner" as const), strand: u.strand, lessons: u.lessons.map((l) => l.id) }));
    expect(unitLabel(units, "r01-signs")).toBe("Reading 1: r01-signs");
    expect(unitLabel(units, "i01-x")).toBe("Intermediate Unit 1: i01-x");
  });
});
