"use client";

import Link from "next/link";
import { useState } from "react";
import type { StrengthCounts } from "@/lib/profile";
import { STRENGTH_LABELS, type Strength } from "@/lib/review/scheduler";
import { ChartCard, DataTable, Tip, useWidth } from "./chartKit";

const LEVELS: Strength[] = [1, 2, 3, 4];
const FILL: Record<Strength, string> = { 1: "var(--viz-1)", 2: "var(--viz-2)", 3: "var(--viz-3)", 4: "var(--viz-4)" };
/** Label ink inside each block, by the block's luminance (light: dark ink on the two light steps). */
const INK: Record<Strength, string> = {
  1: "text-[#10231c] dark:text-white",
  2: "text-[#10231c] dark:text-white",
  3: "text-white dark:text-[#10231c]",
  4: "text-white dark:text-[#10231c]",
};
const MEANING: Record<Strength, string> = {
  1: "fading or new",
  2: "lasts a few days",
  3: "lasts a week or more",
  4: "lasts weeks",
};

/** Tall segmented bar: how the learner's words split across the four memory strengths. */
export function StrengthBar({ counts }: { counts: StrengthCounts }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<Strength | null>(null);
  const total = LEVELS.reduce((n, l) => n + counts[l], 0);
  const parts = LEVELS.filter((l) => counts[l] > 0);
  const gaps = Math.max(0, parts.length - 1) * 2;
  const pxOf = (l: Strength) => (total ? ((width - gaps) * counts[l]) / total : 0);
  const fits = (l: Strength) => pxOf(l) >= String(counts[l]).length * 9 + 14;
  const pct = (l: Strength) => (total ? Math.round((counts[l] / total) * 100) : 0);
  const summary = LEVELS.map((l) => `${STRENGTH_LABELS[l]} ${counts[l]}`).join(", ");

  let left = 0;
  const offsets: Partial<Record<Strength, number>> = {};
  for (const l of parts) {
    offsets[l] = left;
    left += pxOf(l) + 2;
  }

  return (
    <ChartCard
      id="str-h"
      title="Word strength"
      note={`${total} ${total === 1 ? "word" : "words"}, by how long each memory should last before review`}
      table={<DataTable head={["Strength", "Words", "Share"]} rows={LEVELS.map((l) => [STRENGTH_LABELS[l], counts[l], `${pct(l)}%`])} />}
    >
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        <div className="flex h-7 gap-[2px]" role="img" aria-label={`Words by strength: ${summary}`}>
          {width > 0 &&
            parts.map((l) => (
              <div
                key={l}
                className={`flex h-full items-center rounded-[4px] px-2 text-sm font-black ${INK[l]} transition-[filter] ${
                  active === l ? "brightness-110" : ""
                }`}
                style={{ width: pxOf(l), background: FILL[l] }}
                onPointerEnter={() => setActive(l)}
                onPointerDown={() => setActive(l)}
              >
                {fits(l) ? counts[l] : ""}
              </div>
            ))}
        </div>
        {active && (
          <Tip
            x={(offsets[active] ?? 0) + pxOf(active) / 2}
            y={-58}
            width={width}
            value={`${counts[active]} ${counts[active] === 1 ? "word" : "words"} (${pct(active)}%)`}
            label={STRENGTH_LABELS[active]}
          />
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4" aria-label="Legend">
        {LEVELS.map((l) => (
          <li key={l} className="flex items-start gap-2">
            <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: FILL[l] }} aria-hidden />
            <span className="leading-tight">
              <span className="font-extrabold text-ink">
                {STRENGTH_LABELS[l]}
                {!fits(l) && counts[l] > 0 ? ` (${counts[l]})` : ""}
              </span>
              <span className="block text-xs font-semibold text-muted">{MEANING[l]}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/words" className="mt-4 inline-block rounded-lg text-sm font-extrabold text-brand-dark underline-offset-4 hover:underline">
        See all your words
      </Link>
    </ChartCard>
  );
}
