"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { speak, useCanSpeak } from "@/lib/speech";
import type { ListenSelectExercise } from "@/lib/types";
import { useLessonEnv } from "../LessonEnv";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

export function ListenSelect({
  ex,
  locked,
  onChange,
}: ExerciseProps<ListenSelectExercise>) {
  const { scriptTrack } = useLessonEnv();
  const can = useCanSpeak(ex.audio.bn);
  const [reveal, setReveal] = useState(false);
  const played = useRef<string | null>(null);

  // Auto-play once per exercise, as soon as audio is known to be available.
  // If the browser blocks it, the play button still works on tap.
  useEffect(() => {
    if (can === "yes" && played.current !== ex.id) {
      played.current = ex.id;
      speak(ex.audio.bn);
    }
  }, [can, ex.id, ex.audio.bn]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">Tap what you hear</h2>
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
      {can === "no" && (
        <div className="rounded-2xl bg-sunk p-3 text-center text-sm font-semibold text-muted">
          No Bengali audio on this device.{" "}
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
          <span className="mt-1 block">
            <Link
              href="/settings#audio"
              target="_blank"
              rel="noopener"
              className="font-bold underline"
            >
              How to enable Bengali audio
            </Link>
          </span>
        </div>
      )}
      <Choices
        options={ex.options}
        bengali
        translit={scriptTrack ? "never" : "after"}
        large
        locked={locked}
        onChange={onChange}
        answer={ex.answer}
      />
    </div>
  );
}
