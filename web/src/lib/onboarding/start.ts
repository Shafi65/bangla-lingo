import type { KnownLevel, StartPoint } from "./storage";

/**
 * Hook for the future placement test. When it exists, set this to its route and the
 * "I know some" branch will offer it first (see OnboardingFlow). Null = not built yet.
 */
export const PLACEMENT_TEST_HREF: string | null = null;

export interface StartTargets {
  /** First lesson of Unit 1. */
  unit1LessonId?: string;
  /** First lesson of the alphabet (script) track. */
  alphabetLessonId?: string;
}

/** The lesson the intro's last screen should open, from the learner's answers. */
export function resolveStartLesson(
  level: KnownLevel | undefined,
  startAt: StartPoint | undefined,
  t: StartTargets,
): string | undefined {
  if (level === "some" && startAt === "alphabet") return t.alphabetLessonId ?? t.unit1LessonId;
  return t.unit1LessonId;
}
