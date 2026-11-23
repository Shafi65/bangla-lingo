// Pure story flow: lines one at a time with questions slotted in after their line.
import type { Story } from "./types";

export type Step = { kind: "line"; line: number } | { kind: "question"; question: number };

/** Reading order: each line, then the questions placed after it. */
export function buildSteps(story: Pick<Story, "lines" | "questions">): Step[] {
  const steps: Step[] = [];
  story.lines.forEach((_, i) => {
    steps.push({ kind: "line", line: i });
    story.questions.forEach((q, k) => {
      if (q.after === i) steps.push({ kind: "question", question: k });
    });
  });
  return steps;
}

/** A story unlocks once its unit's first lesson is completed (a placement or test-out counts). */
export function isStoryUnlocked(
  story: { firstLessonId: string | null },
  completed: Readonly<Record<string, unknown>>,
): boolean {
  return !!story.firstLessonId && !!completed[story.firstLessonId];
}

/** Fisher–Yates over option indexes; `rand` in [0, 1). */
export function shuffledOrder(n: number, rand: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Short verdict for the end screen. */
export function scoreMessage(score: number, total: number): string {
  if (total === 0) return "Story complete.";
  if (score === total) return "Every answer right. Great reading!";
  if (score >= Math.ceil(total / 2)) return "Nicely done. Read it again to catch the rest.";
  return "Good start. Try reading it once more.";
}
