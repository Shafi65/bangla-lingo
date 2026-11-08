"use client";

import { useState } from "react";
import { BnText } from "@/components/BnText";
import type { TypeTranslationExercise } from "@/lib/types";
import type { ExerciseProps } from "./types";

export function TypeTranslation({
  ex,
  locked,
  onChange,
  onSubmit,
}: ExerciseProps<TypeTranslationExercise>) {
  const [value, setValue] = useState("");
  const bnToEn = ex.direction === "bn_to_en";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">
        {bnToEn ? "Translate into English" : "Write this in Bengali"}
      </h2>
      {bnToEn ? (
        <BnText text={ex.prompt} size="lg" />
      ) : (
        <p className="text-3xl font-bold">“{ex.prompt.en}”</p>
      )}
      <textarea
        value={value}
        readOnly={locked}
        autoFocus
        rows={3}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        lang={bnToEn ? "en" : "bn"}
        placeholder={
          bnToEn ? "Type in English" : "Type in Bengali script or transliteration"
        }
        aria-label="Your answer"
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value.trim() ? { kind: "text", value: e.target.value } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full resize-none rounded-2xl border-2 border-line bg-gray-50 p-4 text-xl font-semibold outline-none focus:border-brand focus:bg-white"
      />
      {!bnToEn && (
        <p className="-mt-3 text-xs font-semibold text-muted">
          Tip: romanized spelling like “dhonnobad” is accepted too.
        </p>
      )}
    </div>
  );
}
