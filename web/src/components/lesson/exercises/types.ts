import type { Response } from "@/lib/answers";
import type { Exercise } from "@/lib/types";

export interface ExerciseProps<E extends Exercise> {
  ex: E;
  /** True once the answer has been checked; inputs become read-only. */
  locked: boolean;
  /** Report the current response (null = nothing answered yet). */
  onChange: (r: Response | null) => void;
  /** Ask the player to check (e.g. Enter in a text field). */
  onSubmit: () => void;
}
