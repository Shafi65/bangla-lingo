"use client";

import { BnText } from "@/components/BnText";
import type { SelectTranslationExercise } from "@/lib/types";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

export function SelectTranslation({
  ex,
  locked,
  onChange,
}: ExerciseProps<SelectTranslationExercise>) {
  const bnToEn = ex.direction === "bn_to_en";
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">
        {bnToEn ? "What does this mean?" : `How do you say "${ex.prompt.en}"?`}
      </h2>
      {bnToEn && <BnText text={ex.prompt} size="lg" />}
      <Choices
        options={ex.options}
        bengali={!bnToEn}
        locked={locked}
        onChange={onChange}
      />
    </div>
  );
}
