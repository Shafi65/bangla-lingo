"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BnText } from "@/components/BnText";
import { SpeakButton } from "@/components/SpeakButton";
import { speak, useCanSpeak } from "@/lib/speech";
import type { ListenMeaningExercise } from "@/lib/types";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

/**
 * Hear a Bengali sentence, pick its meaning. The Bengali text and its
 * transliteration stay hidden until the answer is checked (the feedback panel
 * then shows them with audio). Without any Bengali audio the learner can
 * reveal the text instead.
 */
export function ListenMeaning({ ex, locked, onChange }: ExerciseProps<ListenMeaningExercise>) {
  const can = useCanSpeak(ex.audio.bn);
  const [reveal, setReveal] = useState(false);
  const played = useRef<string | null>(null);

  // Auto-play once per exercise; if the browser blocks it, the button still works on tap.
  useEffect(() => {
    if (can === "yes" && played.current !== ex.id) {
      played.current = ex.id;
      speak(ex.audio.bn);
    }
  }, [can, ex.id, ex.audio.bn]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">What does it mean?</h2>
      <div className="flex items-end justify-center gap-6 py-2">
        <div className="flex flex-col items-center gap-2">
          <SpeakButton bn={ex.audio.bn} size="lg" />
          <span aria-hidden className="text-sm font-extrabold text-muted">Play</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <SpeakButton bn={ex.audio.bn} slow className="h-14! w-14!" />
          <span aria-hidden className="text-sm font-extrabold text-muted">Slower</span>
        </div>
      </div>
      {can === "no" && !locked && (
        <div className="rounded-2xl bg-sunk p-3 text-center text-sm font-semibold text-muted">
          No Bengali audio on this device.{" "}
          {reveal ? (
            <div className="mt-2 flex justify-center text-left">
              <BnText text={ex.audio} speaker={false} />
            </div>
          ) : (
            <button
              type="button"
              className="font-black text-brand underline"
              onClick={() => setReveal(true)}
            >
              Show the sentence instead
            </button>
          )}
          <span className="mt-1 block">
            <Link href="/settings#audio" target="_blank" rel="noopener" className="font-bold underline">
              How to enable Bengali audio
            </Link>
          </span>
        </div>
      )}
      <Choices options={ex.options} bengali={false} locked={locked} onChange={onChange} answer={ex.answer} />
    </div>
  );
}
