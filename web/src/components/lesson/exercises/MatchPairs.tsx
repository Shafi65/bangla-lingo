"use client";

import { useMemo, useState } from "react";
import { seededShuffle } from "@/lib/answers";
import { Translit } from "@/components/Translit";
import { speak } from "@/lib/speech";
import type { MatchPairsExercise } from "@/lib/types";
import type { ExerciseProps } from "./types";

type Side = "bn" | "en";

export function MatchPairs({ ex, locked, onChange }: ExerciseProps<MatchPairsExercise>) {
  const [left, right] = useMemo(() => {
    const idx = ex.pairs.map((_, i) => i);
    return [seededShuffle(idx, `${ex.id}:bn`), seededShuffle(idx, `${ex.id}:en`)];
  }, [ex.id, ex.pairs]);

  const [sel, setSel] = useState<{ side: Side; i: number } | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set());
  const [wrong, setWrong] = useState<{ bn: number; en: number } | null>(null);

  const tap = (side: Side, i: number) => {
    if (locked || matched.has(i)) return;
    if (side === "bn") speak(ex.pairs[i].bn);
    setWrong(null);
    if (!sel || sel.side === side) {
      setSel(sel && sel.side === side && sel.i === i ? null : { side, i });
      return;
    }
    // Two different sides selected: check
    if (sel.i === i) {
      const next = new Set(matched).add(i);
      setMatched(next);
      if (next.size === ex.pairs.length) onChange({ kind: "matched" });
    } else {
      setWrong(side === "bn" ? { bn: i, en: sel.i } : { bn: sel.i, en: i });
    }
    setSel(null);
  };

  // Same card as multiple choice; state via data attributes so styles stay in one place.
  const state = (side: Side, i: number): "matched" | "wrong" | "selected" | undefined => {
    if (matched.has(i)) return "matched";
    if (wrong && wrong[side] === i) return "wrong";
    if (sel && sel.side === side && sel.i === i) return "selected";
    return undefined;
  };
  const cls = (side: Side, i: number) => {
    const st = state(side, i);
    const base = "choice min-h-16 flex-col justify-center gap-0 text-center";
    if (st === "matched") return `${base} match-done`;
    if (st === "wrong") return `${base} animate-shake border-accent! bg-accent-light! text-accent-dark! [--lip:var(--color-accent)]`;
    if (st === "selected") return `${base} border-brand! bg-brand-light! text-brand-dark! [--lip:var(--color-brand)]`;
    return base;
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">Tap the matching pairs</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          {left.map((i) => (
            <button
              key={i}
              type="button"
              data-enter-native
              className={cls("bn", i)}
              aria-pressed={state("bn", i) === "selected"}
              disabled={locked || matched.has(i)}
              onClick={() => tap("bn", i)}
            >
              <span lang="bn" className="text-2xl">{ex.pairs[i].bn}</span>
              <Translit tr={ex.pairs[i].tr} inButton className="text-xs font-semibold" />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {right.map((i) => (
            <button
              key={i}
              type="button"
              data-enter-native
              className={cls("en", i)}
              aria-pressed={state("en", i) === "selected"}
              disabled={locked || matched.has(i)}
              onClick={() => tap("en", i)}
            >
              <span className="text-pretty">{ex.pairs[i].en}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
