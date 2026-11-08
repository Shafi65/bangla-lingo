"use client";

import { useEffect, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { speak, useHasBengaliVoice } from "@/lib/speech";
import type { ListenSelectExercise } from "@/lib/types";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

export function ListenSelect({
  ex,
  locked,
  onChange,
}: ExerciseProps<ListenSelectExercise>) {
  const hasVoice = useHasBengaliVoice();
  const [reveal, setReveal] = useState(false);

  // Auto-play once when a voice becomes available.
  useEffect(() => {
    if (hasVoice) speak(ex.audio.bn);
  }, [hasVoice, ex.audio.bn]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">Tap what you hear</h2>
      <div className="flex items-center justify-center gap-4 py-2">
        <SpeakButton bn={ex.audio.bn} size="lg" />
        <SpeakButton bn={ex.audio.bn} slow />
      </div>
      {!hasVoice && (
        <div className="rounded-2xl bg-paper p-3 text-center text-sm font-semibold text-muted">
          No Bengali voice on this device.{" "}
          {reveal ? (
            <span>
              Pick the word pronounced{" "}
              <span className="font-black text-ink italic">“{ex.audio.tr}”</span>.
            </span>
          ) : (
            <button
              type="button"
              className="font-black text-brand underline"
              onClick={() => setReveal(true)}
            >
              Show transliteration instead
            </button>
          )}
        </div>
      )}
      <Choices
        options={ex.options}
        bengali
        large
        locked={locked}
        onChange={onChange}
        answer={ex.answer}
      />
    </div>
  );
}
