// Checkpoint test-out: which lessons a checkpoint covers, and which checkpoint may be tested out of. Pure.
import { isReading, numberUnits } from "../courseSections";
import type { LessonRecord } from "../progress";
import type { CourseSummary, UnitSummary } from "../types";

export interface CheckpointSpan {
  /** The checkpoint lesson. */
  id: string;
  /** Main-track lessons from just after the previous checkpoint (or the course start) up to and including this one, in course order. */
  lessonIds: string[];
  /** The main-track units those lessons belong to, in course order. */
  units: UnitSummary[];
  /** "Units 1–3" */
  label: string;
}

/** Everything a lesson page needs to offer test-out (plain data: it is passed to a client component). */
export interface TestOutInfo {
  label: string;
  /** Lesson ids passing marks done (includes the checkpoint itself). */
  covered: string[];
  /** The checkpoint ids of this checkpoint's own track (main, or reading) in course order (for the "next checkpoint ahead" rule). */
  order: string[];
}

const mainUnits = (course: CourseSummary) => course.units.filter((u) => u.track !== "script");
const levelOf = (u: UnitSummary) => u.level ?? "beginner";
/** Checkpoints cover and unlock within one track: the Reading track is separate from the beginner/intermediate main track. */
const trackOf = (u: UnitSummary) => (isReading(u) ? "reading" : "main");
const sameTrack = (a: UnitSummary, b: UnitSummary) => trackOf(a) === trackOf(b) && levelOf(a) === levelOf(b);

/**
 * Main-track checkpoint lessons in course order (Reading-track ones are listed by `readingCheckpointIds`).
 * Script-track units are a separate track and never hold one.
 */
export function checkpointIds(course: CourseSummary): string[] {
  return mainUnits(course).filter((u) => !isReading(u)).flatMap((u) => u.lessons.filter((l) => l.kind === "checkpoint").map((l) => l.id));
}

/** Reading-track checkpoint lessons in course order; test-out for them is independent of the main track. */
export function readingCheckpointIds(course: CourseSummary): string[] {
  return mainUnits(course).filter(isReading).flatMap((u) => u.lessons.filter((l) => l.kind === "checkpoint").map((l) => l.id));
}

function spanLabel(course: CourseSummary, units: UnitSummary[]): string {
  if (!units.length) return "";
  const labels = new Map(numberUnits(course).map((n) => [n.unit.id, n]));
  const name = (u: UnitSummary) => {
    const n = labels.get(u.id)?.label ?? u.title;
    if (isReading(u)) return n;
    return u.level === "intermediate" ? (n === "Bridge" ? "Intermediate: Bridge" : `Intermediate ${n}`) : n;
  };
  const first = units[0];
  const last = units[units.length - 1];
  if (first.id === last.id) return name(first);
  if (isReading(first)) return `${name(first)} to ${name(last)}`; // a span never leaves its track; Reading 1 to Reading 3
  if ((first.level === "intermediate") !== (last.level === "intermediate")) return `${name(first)} to ${name(last)}`;
  const num = (u: UnitSummary) => (labels.get(u.id)?.label ?? "").replace(/^Unit /, "");
  if (num(first) === "Bridge") return `Bridge to Unit ${num(last)}`;
  return `Units ${num(first)}–${num(last)}`;
}

/**
 * What `checkpointId` covers: only lessons of its own level (a beginner checkpoint never reaches into
 * intermediate units and vice versa), so an intermediate checkpoint starts at the first intermediate
 * lesson or just after the previous intermediate checkpoint. A Reading-track checkpoint covers only
 * Reading-track lessons, and an intermediate one never reaches into the Reading track.
 * Undefined if it is not a main-track checkpoint lesson.
 */
export function checkpointSpan(course: CourseSummary, checkpointId: string): CheckpointSpan | undefined {
  const all = mainUnits(course).flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
  const own = all.find((x) => x.lesson.id === checkpointId);
  if (!own || own.lesson.kind !== "checkpoint") return undefined;
  const flat = all.filter((x) => sameTrack(x.unit, own.unit));
  const at = flat.findIndex((x) => x.lesson.id === checkpointId);
  let from = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (flat[i].lesson.kind === "checkpoint") {
      from = i + 1;
      break;
    }
  }
  const slice = flat.slice(from, at + 1);
  const units: UnitSummary[] = [];
  for (const x of slice) if (units[units.length - 1] !== x.unit) units.push(x.unit);
  return { id: checkpointId, lessonIds: slice.map((x) => x.lesson.id), units, label: spanLabel(course, units) };
}

/** Data for the lesson page; undefined for any lesson that is not a main-track checkpoint. */
export function testOutInfo(course: CourseSummary, lessonId: string): TestOutInfo | undefined {
  const span = checkpointSpan(course, lessonId);
  if (!span) return undefined;
  const order = isReading(span.units[0]) ? readingCheckpointIds(course) : checkpointIds(course);
  return { label: span.label, covered: span.lessonIds, order };
}

/**
 * The one checkpoint a learner may test out of: the first checkpoint, in course order, that is not
 * completed yet (the next one ahead; later ones wait their turn). Beginner checkpoints come before
 * intermediate ones, so a learner with a beginner checkpoint still open is never offered an intermediate one.
 */
export function nextCheckpointId(order: readonly string[], completed: Record<string, LessonRecord>): string | undefined {
  return order.find((id) => !completed[id]);
}

/** Whether test-out is allowed for `id` right now. */
export function canTestOut(order: readonly string[], completed: Record<string, LessonRecord>, id: string): boolean {
  return nextCheckpointId(order, completed) === id;
}

export interface TestOutOffer {
  id: string;
  label: string;
  /** Covered lessons (the checkpoint included) not completed yet. */
  remaining: number;
}

/**
 * The test-out entry for the course map: the next checkpoint ahead, when something it covers is still
 * unfinished (so a learner whose whole span is done just plays the checkpoint). The normal in-order
 * unlock is unchanged. The Reading track has its own next checkpoint; its offer is shown only once the
 * learner has started the Reading track (otherwise the main track's offer comes first).
 */
export function testOutOffer(course: CourseSummary, completed: Record<string, LessonRecord>): TestOutOffer | undefined {
  const offerFor = (order: string[]): TestOutOffer | undefined => {
    const id = nextCheckpointId(order, completed);
    if (!id) return undefined;
    const span = checkpointSpan(course, id);
    if (!span) return undefined;
    const remaining = span.lessonIds.filter((l) => !completed[l]).length;
    return remaining > 1 ? { id, label: span.label, remaining } : undefined;
  };
  const main = offerFor(checkpointIds(course));
  const readingStarted = course.units.some((u) => isReading(u) && u.lessons.some((l) => completed[l.id]));
  const reading = readingStarted || !main ? offerFor(readingCheckpointIds(course)) : undefined;
  return reading ?? main;
}
