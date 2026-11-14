"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BnText } from "@/components/BnText";
import { Translit } from "@/components/Translit";
import { seededShuffle } from "@/lib/answers";
import { useFlip } from "@/lib/ui/flip";
import type { WordBankExercise } from "@/lib/types";
import { useLessonEnv } from "../LessonEnv";
import { modalOpen } from "./Choices";
import type { ExerciseProps } from "./types";

export function WordBank({ ex, locked, onChange }: ExerciseProps<WordBankExercise>) {
  const bnToEn = ex.direction === "bn_to_en";
  const env = useLessonEnv();
  const showTr = !bnToEn && (!env.scriptTrack || locked);
  const trOf = (tileIdx: number) =>
    showTr ? env.translit[ex.tiles[tileIdx].normalize("NFC")] : undefined;
  // Tile order shuffled deterministically; we track original tile indices.
  const order = useMemo(
    () => seededShuffle(ex.tiles.map((_, i) => i), ex.id),
    [ex.tiles, ex.id],
  );
  const [picked, setPicked] = useState<number[]>([]);

  const update = (next: number[]) => {
    setPicked(next);
    onChange(next.length ? { kind: "tiles", value: next } : null);
  };

  // Backspace removes the last tile.
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "Backspace" || t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || modalOpen()) return;
      e.preventDefault();
      setPicked((p) => {
        const next = p.slice(0, -1);
        onChange(next.length ? { kind: "tiles", value: next } : null);
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onChange]);

  const area = useRef<HTMLDivElement>(null);
  useFlip(area, picked);
  const bn = !bnToEn;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">
        {bnToEn ? "Translate this sentence" : "Build this in Bengali"}
      </h2>
      {bnToEn ? (
        <BnText text={ex.prompt} size="lg" />
      ) : (
        <p className="text-3xl leading-tight font-bold text-pretty">“{ex.prompt.en}”</p>
      )}

      <div ref={area} className="flex flex-col gap-6">
        {/* Answer line */}
        <div
          className="flex min-h-[8rem] flex-wrap content-start gap-x-2 gap-y-3 border-y-2 border-line py-3"
          role="group"
          aria-label="Your answer"
        >
          {picked.map((tileIdx, pos) => (
            <button
              key={tileIdx}
              data-flip={tileIdx}
              type="button"
              data-enter-native
              disabled={locked}
              aria-label={`Remove ${ex.tiles[tileIdx]}`}
              className="tile"
              lang={bn ? "bn" : undefined}
              onClick={() => update(picked.filter((_, p) => p !== pos))}
            >
              <span>{ex.tiles[tileIdx]}</span>
              {trOf(tileIdx) && (
                <Translit tr={trOf(tileIdx)!} inButton className="text-xs font-semibold" />
              )}
            </button>
          ))}
        </div>

        {/* Bank: a used tile leaves a recessed slot of the same size behind. */}
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-3">
          {order.map((tileIdx) => {
            const used = picked.includes(tileIdx);
            const tr = trOf(tileIdx);
            return (
              <span key={tileIdx} className="relative inline-flex">
                <span aria-hidden className="tile-slot" lang={bn ? "bn" : undefined}>
                  <span>{ex.tiles[tileIdx]}</span>
                  {tr && <Translit tr={tr} inButton className="text-xs font-semibold" />}
                </span>
                {!used && (
                  <button
                    type="button"
                    data-flip={tileIdx}
                    data-enter-native
                    disabled={locked}
                    lang={bn ? "bn" : undefined}
                    className="tile absolute inset-0"
                    onClick={() => update([...picked, tileIdx])}
                  >
                    <span>{ex.tiles[tileIdx]}</span>
                    {tr && <Translit tr={tr} inButton className="text-xs font-semibold" />}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
