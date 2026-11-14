import type { LessonSummary } from "./types";

/**
 * Review lessons carry `kind: "review"` from their plan (see content.ts); the
 * "Review ..." title check is only a fallback for lessons without a plan kind.
 */
export function isReviewLesson(l: Pick<LessonSummary, "title"> & { kind?: LessonSummary["kind"] }): boolean {
  if (l.kind === "review") return true;
  if (l.kind === "checkpoint") return false;
  return /^review\b/i.test(l.title.trim());
}
