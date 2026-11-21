"use client";

import { useEffect, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import { ensureGuideFont, renderGlyphMask } from "@/lib/write/glyph";
import type { WriteLetter } from "@/lib/write/letters";
import {
  MEMORY_PARAMS,
  TRACE_PARAMS,
  scoreStrokes,
  type Mask,
  type ScoreResult,
  type Stroke,
} from "@/lib/write/scoring";
import { recordWrite } from "@/lib/write/storage";
import { TraceCanvas } from "./TraceCanvas";

type Step = "watch" | "trace" | "memory";
const STEPS: { id: Step; label: string }[] = [
  { id: "watch", label: "Watch" },
  { id: "trace", label: "Trace" },
  { id: "memory", label: "Write" },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function feedback(step: Step, r: ScoreResult): string {
  const detail = `You covered ${pct(r.coverage)} of the letter and ${pct(r.precision)} of your lines were on it.`;
  switch (r.reason) {
    case "ok":
      return step === "trace"
        ? `Well traced. ${detail}`
        : `Well remembered. ${detail} The letter is shown in green so you can compare.`;
    case "empty":
      return "Nothing to check yet. Draw the letter, then press Check.";
    case "missed":
      return `Not quite: part of the letter is missing. ${detail} Follow the whole shape${
        step === "memory" ? ", then compare with the green letter" : ""
      }.`;
    case "stray":
      return `Not quite: too many lines are off the letter. ${detail} Go slowly and keep to the shape.`;
    default:
      return `Not quite. ${detail} Try again, slowly.`;
  }
}

export function PracticePanel({
  letter,
  index,
  total,
  onPrev,
  onNext,
  onBack,
}: {
  letter: WriteLetter;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("watch");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [mask, setMask] = useState<Mask | null>(null);

  // The glyph mask (what the strokes are scored against), once the font is ready.
  useEffect(() => {
    let alive = true;
    void ensureGuideFont(letter.glyph).then(() => alive && setMask(renderGlyphMask(letter.glyph)));
    return () => {
      alive = false;
    };
  }, [letter.glyph]);

  const go = (s: Step) => {
    setStep(s);
    setStrokes([]);
    setResult(null);
  };
  const change = (next: Stroke[]) => {
    setStrokes(next);
    setResult(null);
  };

  const check = () => {
    if (!mask) return;
    const r = scoreStrokes(mask, strokes, step === "trace" ? TRACE_PARAMS : MEMORY_PARAMS);
    setResult(r);
    if (r.passed) recordWrite(letter.id, step === "trace" ? "traced" : "written");
  };

  const drawing = step !== "watch";
  const canvasLabel =
    step === "trace"
      ? `Drawing area. Trace the letter ${letter.glyph} over the faint guide with a finger, stylus or mouse.`
      : `Drawing area. Write the letter ${letter.glyph} from memory with a finger, stylus or mouse.`;

  return (
    <section aria-labelledby="write-letter-heading" className="mt-2" data-testid="write-panel">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          All letters
        </button>
        <p className="text-sm font-extrabold text-muted" aria-live="off">
          {index + 1} of {total}
        </p>
      </div>

      <h2 id="write-letter-heading" className="sr-only">
        Practise the letter {letter.glyph}
      </h2>

      <ol className="mt-4 flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const cur = s.id === step;
          return (
            <li
              key={s.id}
              aria-current={cur ? "step" : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border-2 px-2 text-sm font-extrabold ${
                cur ? "border-brand bg-brand-light text-brand-dark" : "border-line text-muted"
              }`}
            >
              {i + 1}. {s.label}
            </li>
          );
        })}
      </ol>

      {step === "watch" ? (
        <div className="mt-4 rounded-3xl border-2 border-line bg-surface p-5 text-center">
          <div
            lang="bn"
            data-testid="watch-glyph"
            className="font-bengali text-[7rem] leading-[1.25] font-bold text-ink"
          >
            {letter.glyph}
          </div>
          <div className="mt-1 flex items-center justify-center gap-3">
            <SpeakButton bn={letter.speak} size="md" />
            <div className="text-left">
              <div className="text-xl font-black">
                <Translit tr={letter.tr} />
              </div>
              <div className="text-sm font-semibold text-pretty text-muted">{letter.en}</div>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold text-pretty text-muted">
            Look at the shape and listen to the sound. Then trace it.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <TraceCanvas
            key={step}
            glyph={letter.glyph}
            guide={step === "trace" ? "faint" : result ? "overlay" : "off"}
            strokes={strokes}
            onStrokesChange={change}
            onDrawStart={() => setResult(null)}
            shift={result?.shift}
            label={canvasLabel}
          />
          <p className="mt-2 text-center text-sm font-semibold text-muted">
            {step === "trace"
              ? "Trace over the faint letter."
              : "Write the letter from memory. The guide appears after you check."}
          </p>
        </div>
      )}

      {drawing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={strokes.length === 0}
            onClick={() => change(strokes.slice(0, -1))}
          >
            Undo stroke
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={strokes.length === 0}
            onClick={() => change([])}
          >
            Clear
          </button>
          {step === "memory" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("trace")}>
              Back to tracing
            </button>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" data-testid="write-result" className="mt-3">
        {result && (
          <p
            data-passed={result.passed}
            className={`rounded-2xl border-2 p-3 text-base font-bold text-pretty ${
              result.passed
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-accent bg-accent-light text-accent-dark"
            }`}
          >
            {feedback(step, result)}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {step === "watch" && (
          <>
            <button type="button" className="btn btn-primary w-full" onClick={() => go("trace")}>
              Start tracing
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={() => go("memory")}>
              Skip tracing
            </button>
          </>
        )}
        {step === "trace" &&
          (result?.passed ? (
            <>
              <button type="button" className="btn btn-primary w-full" onClick={() => go("memory")}>
                Write it from memory
              </button>
              <button type="button" className="btn btn-ghost w-full" onClick={() => change([])}>
                Trace again
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={!mask || strokes.length === 0}
                onClick={check}
              >
                Check my tracing
              </button>
              <button type="button" className="btn btn-ghost w-full" onClick={() => go("memory")}>
                Skip tracing
              </button>
            </>
          ))}
        {step === "memory" &&
          (result?.passed ? (
            <button type="button" className="btn btn-primary w-full" onClick={onNext} disabled={index + 1 >= total}>
              {index + 1 >= total ? "That was the last letter" : "Next letter"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={!mask || strokes.length === 0}
                onClick={result ? () => change([]) : check}
              >
                {result ? "Try again" : "Check my writing"}
              </button>
              {index + 1 < total && (
                <button type="button" className="btn btn-ghost w-full" onClick={onNext}>
                  Skip to the next letter
                </button>
              )}
            </>
          ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm flex-1" disabled={index === 0} onClick={onPrev}>
          Previous letter
        </button>
        <button type="button" className="btn btn-ghost btn-sm flex-1" disabled={index + 1 >= total} onClick={onNext}>
          Next letter
        </button>
      </div>

      <aside className="mt-5 rounded-2xl border-2 border-sun bg-sun-light p-4 text-sun-dark">
        <h3 className="text-base font-black">The top line (মাত্রা matra)</h3>
        <p className="mt-1 text-sm font-semibold text-pretty">
          Most Bengali letters hang from a headline, the <span lang="bn">মাত্রা</span>. Writers usually draw the
          top line last, after the rest of the letter. Some letters and marks have no top line, so there is
          nothing to add at the end.
        </p>
        <p className="mt-2 text-sm font-semibold text-pretty">
          Stroke-order guidance for each letter is coming. For now, trace in whatever order feels natural.
        </p>
      </aside>
    </section>
  );
}
