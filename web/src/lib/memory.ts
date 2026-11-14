// Per-word memory (spaced review). Owned by the smart-review workstream.
// Placeholder: the lesson player calls recordExerciseResult after every checked answer.
import type { Exercise } from "./types";

/** Record one checked answer. Must be cheap, synchronous and safe during SSR (no-op on the server). */
export function recordExerciseResult(lessonId: string, exercise: Exercise, correct: boolean): void {
  void lessonId; void exercise; void correct;
}
