"use client";

import { useState } from "react";
import type { Response } from "@/lib/answers";

/** Shared multiple-choice grid used by several exercise types. */
export function Choices({
  options,
  bengali,
  locked,
  onChange,
  large = false,
}: {
  options: string[];
  bengali: boolean;
  locked: boolean;
  onChange: (r: Response | null) => void;
  large?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className={`grid gap-3 ${large ? "grid-cols-2" : "grid-cols-1"}`} role="group">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          className={`choice flex items-center gap-3 ${large ? "justify-center text-center" : ""}`}
          aria-pressed={selected === i}
          disabled={locked}
          onClick={() => {
            setSelected(i);
            onChange({ kind: "index", value: i });
          }}
        >
          {!large && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-line text-sm text-muted">
              {i + 1}
            </span>
          )}
          <span lang={bengali ? "bn" : undefined} className={bengali ? "text-2xl" : ""}>
            {opt}
          </span>
        </button>
      ))}
    </div>
  );
}
