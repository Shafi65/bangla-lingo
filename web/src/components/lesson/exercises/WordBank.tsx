"use client";

import { useMemo, useState } from "react";
import { BnText } from "@/components/BnText";
import { seededShuffle } from "@/lib/answers";
import type { WordBankExercise } from "@/lib/types";
import type { ExerciseProps } from "./types";

export function WordBank({ ex, locked, onChange }: ExerciseProps<WordBankExercise>) {
  const bnToEn = ex.direction === "bn_to_en";
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

  const tileCls =
    "min-h-12 rounded-xl border-2 border-b-4 border-line bg-white px-4 py-2 text-lg font-bold transition active:translate-y-0.5";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">
        {bnToEn ? "Translate this sentence" : "Build this in Bengali"}
      </h2>
      {bnToEn ? (
        <BnText text={ex.prompt} size="lg" />
      ) : (
        <p className="text-3xl font-bold">“{ex.prompt.en}”</p>
      )}

      {/* Answer line */}
      <div
        className="flex min-h-[7.5rem] flex-wrap content-start gap-2 border-y-2 border-line py-3"
        aria-label="Your answer"
      >
        {picked.map((tileIdx, pos) => (
          <button
            key={`${tileIdx}-${pos}`}
            type="button"
            disabled={locked}
            className={`${tileCls} animate-pop`}
            lang={bnToEn ? undefined : "bn"}
            onClick={() => update(picked.filter((_, p) => p !== pos))}
          >
            {ex.tiles[tileIdx]}
          </button>
        ))}
      </div>

      {/* Bank */}
      <div className="flex flex-wrap justify-center gap-2">
        {order.map((tileIdx) => {
          const used = picked.includes(tileIdx);
          return (
            <button
              key={tileIdx}
              type="button"
              disabled={locked || used}
              aria-hidden={used}
              lang={bnToEn ? undefined : "bn"}
              className={`${tileCls} ${
                used ? "border-line bg-line text-transparent" : "hover:bg-gray-50"
              }`}
              onClick={() => update([...picked, tileIdx])}
            >
              {ex.tiles[tileIdx]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
