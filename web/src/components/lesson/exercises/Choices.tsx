"use client";

import { useEffect, useState } from "react";
import type { Response } from "@/lib/answers";

/** True if a key event came from a text field (don't hijack typing). */
export function fromTextField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/**
 * Shared multiple-choice grid used by several exercise types.
 * Number keys 1–9 pick an option. After checking, the right option (and the
 * learner's wrong pick) are marked.
 */
export function Choices({
  options,
  bengali,
  locked,
  onChange,
  answer,
  large = false,
}: {
  options: string[];
  bengali: boolean;
  locked: boolean;
  onChange: (r: Response | null) => void;
  /** Index of the correct option, used to mark choices once locked. */
  answer?: number;
  large?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || fromTextField(e)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        setSelected(n - 1);
        onChange({ kind: "index", value: n - 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, options.length, onChange]);

  const verdict = (i: number) => {
    if (!locked || answer === undefined) return undefined;
    if (i === answer) return "right";
    if (i === selected) return "wrong";
    return undefined;
  };

  return (
    <div className={`grid gap-3 ${large ? "grid-cols-2" : "grid-cols-1"}`} role="group" aria-label="Answer options">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          className={`choice flex items-center gap-3 ${large ? "relative min-h-20 justify-center text-center sm:px-9" : ""}`}
          aria-pressed={selected === i}
          aria-keyshortcuts={String(i + 1)}
          data-verdict={verdict(i)}
          disabled={locked}
          onClick={() => {
            setSelected(i);
            onChange({ kind: "index", value: i });
          }}
        >
          <span
            className={`kbd ${large ? "absolute top-2 left-2 hidden h-6 min-w-6 text-xs sm:inline-flex" : ""}`}
            aria-hidden
          >
            {i + 1}
          </span>
          <span lang={bengali ? "bn" : undefined} className={bengali ? "text-2xl" : ""}>
            {opt}
          </span>
        </button>
      ))}
    </div>
  );
}
