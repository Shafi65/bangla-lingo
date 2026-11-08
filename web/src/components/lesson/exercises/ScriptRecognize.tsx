"use client";

import { SpeakButton } from "@/components/SpeakButton";
import type { ScriptRecognizeExercise } from "@/lib/types";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

export function ScriptRecognize({
  ex,
  locked,
  onChange,
}: ExerciseProps<ScriptRecognizeExercise>) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">Which sound does this letter make?</h2>
      <div className="flex flex-col items-center gap-3">
        <div
          lang="bn"
          aria-label={`Letter ${ex.glyph}`}
          className="flex h-40 w-40 items-center justify-center rounded-3xl border-2 border-b-[6px] border-line bg-white text-8xl font-bold text-ink"
        >
          {ex.glyph}
        </div>
        {/* Audio is only offered after checking, so it doesn't give the answer away */}
        {locked && <SpeakButton bn={ex.glyph} size="sm" />}
      </div>
      <Choices options={ex.options} bengali={false} large locked={locked} onChange={onChange} answer={ex.answer} />
    </div>
  );
}
