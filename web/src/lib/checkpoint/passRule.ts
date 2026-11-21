// Test-out pass rule. Pure.

/** Share of exercises that must be right on the first attempt. */
export const TESTOUT_MIN_ACCURACY = 0.8;

export interface TestOutRun {
  /** Hearts left at the end of the run. */
  heartsLeft: number;
  /** Exercises answered correctly on the first attempt. */
  firstTry: number;
  /** Exercises in the lesson. */
  total: number;
}

/** Pass = finished with at least one heart left and at least 80 % right first time. */
export function testOutPassed({ heartsLeft, firstTry, total }: TestOutRun): boolean {
  if (total <= 0 || heartsLeft < 1) return false;
  return firstTry * 5 >= total * 4; // integer form of firstTry / total >= 0.8
}

/** First-try answers needed to pass a lesson of `total` exercises. */
export function firstTryNeeded(total: number): number {
  return Math.ceil((total * 4) / 5);
}
