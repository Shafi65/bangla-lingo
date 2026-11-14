"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Translit } from "@/components/Translit";
import type { Response } from "@/lib/answers";
import { useLessonEnv } from "../LessonEnv";

/** True if a key event came from a text field (don't hijack typing). */
export function fromTextField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/** True while a modal dialog (e.g. the lesson tip) is open: exercise shortcuts pause. */
export function modalOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector("dialog[open]");
}

// useLayoutEffect warns/no-ops on the server in some setups; fall back there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shared multiple-choice grid used by several exercise types.
 *
 * Options are shuffled once when the exercise mounts (SSR and first render use
 * the authored order, so hydration is stable; the shuffle runs before paint).
 * `selected`/`answer` and the reported response always use the ORIGINAL option
 * index, so grading by `answer` is unaffected. Number keys 1-9 pick the option
 * in that DISPLAYED position.
 *
 * When `bengali`, a transliteration is shown under each option (if known):
 * `translit="always"` immediately, `"after"` only once checked, `"never"` not at all.
 */
export function Choices({
  options,
  bengali,
  locked,
  onChange,
  answer,
  large = false,
  translit = "never",
}: {
  options: string[];
  bengali: boolean;
  locked: boolean;
  onChange: (r: Response | null) => void;
  /** Original index of the correct option, used to mark choices once locked. */
  answer?: number;
  large?: boolean;
  translit?: "always" | "after" | "never";
}) {
  const env = useLessonEnv();
  const [selected, setSelected] = useState<number | null>(null); // original index
  const [order, setOrder] = useState<number[]>(() => options.map((_, i) => i)); // shown slot -> original index

  useIsoLayoutEffect(() => {
    setOrder(shuffled(options.length));
    // Once per mount; the player remounts the exercise each time it is shown.
  }, []);

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || fromTextField(e) || modalOpen()) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= order.length) {
        e.preventDefault();
        const orig = order[n - 1];
        setSelected(orig);
        onChange({ kind: "index", value: orig });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, order, onChange]);

  const verdict = (orig: number) => {
    if (!locked || answer === undefined) return undefined;
    if (orig === answer) return "right";
    if (orig === selected) return "wrong";
    return undefined;
  };

  const showTr = bengali && (translit === "always" || (translit === "after" && locked));

  return (
    <div className={`grid gap-3 ${large ? "grid-cols-2" : "grid-cols-1"}`} role="group" aria-label="Answer options">
      {order.map((orig, slot) => {
        const opt = options[orig];
        const tr = showTr ? env.translit[opt.normalize("NFC")] : undefined;
        return (
          <button
            key={orig}
            type="button"
            className={`choice ${large ? "relative min-h-20 justify-center text-center sm:px-9" : ""}`}
            aria-pressed={selected === orig}
            aria-keyshortcuts={String(slot + 1)}
            data-verdict={verdict(orig)}
            data-dim={locked && verdict(orig) === undefined ? "true" : undefined}
            disabled={locked}
            onClick={() => {
              setSelected(orig);
              onChange({ kind: "index", value: orig });
            }}
          >
            <span
              className={`kbd ${large ? "absolute top-2 left-2 hidden h-6 min-w-6 text-xs sm:inline-flex" : ""}`}
              aria-hidden
            >
              {slot + 1}
            </span>
            <span className="flex min-w-0 flex-col leading-tight text-pretty">
              <span lang={bengali ? "bn" : undefined} className={bengali ? "text-2xl leading-snug" : ""}>
                {opt}
              </span>
              {tr && <Translit tr={tr} inButton className="text-sm font-semibold" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
