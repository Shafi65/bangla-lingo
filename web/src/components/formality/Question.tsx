"use client";

import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import { isAccepted } from "@/lib/formality/engine";
import type { FormalityScenario, FormalityTier } from "@/lib/formality/types";
import { hasRecording } from "@/lib/speech";

/** Bengali with the `___` gap drawn as a visible blank (read out as "blank"). */
function WithGap({ text }: { text: string }) {
  const parts = text.split("___");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span className="mx-1 inline-block min-w-14 border-b-4 border-brand align-baseline" role="img" aria-label="blank" />
          )}
        </span>
      ))}
    </>
  );
}

/**
 * One scenario: situation, optional frame, options (shown in `order`), Check, then feedback with
 * the "why". `onDone` reports the original index chosen once the learner continues.
 */
export function Question({
  scenario,
  tier,
  order,
  index,
  total,
  onDone,
}: {
  scenario: FormalityScenario;
  tier: FormalityTier | undefined;
  /** Display slot -> original option index. */
  order: number[];
  index: number;
  total: number;
  onDone: (chosen: number, correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const correct = checked && selected !== null && isAccepted(scenario, selected);

  useEffect(() => {
    if (checked) continueRef.current?.focus();
  }, [checked]);
  useEffect(() => {
    if (index > 0) headingRef.current?.focus();
  }, [index]);

  const verdict = (orig: number) => {
    if (!checked) return undefined;
    if (scenario.answer.includes(orig)) return "right";
    if (orig === selected) return "wrong";
    return undefined;
  };

  const promptClip = scenario.prompt && !scenario.prompt.bn.includes("___") && hasRecording(scenario.prompt.bn);

  return (
    <div className="flex flex-col gap-5" data-scenario-id={scenario.id}>
      <div className="flex items-center gap-3">
        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Round progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index}
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(index / total) * 100}%` }} />
        </div>
        <span className="text-sm font-extrabold text-muted tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      <div>
        {tier && <p className="text-xs font-black tracking-wide text-muted uppercase">Level {tier.id} · {tier.title}</p>}
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-black text-pretty outline-none">
          {scenario.situation}
        </h2>
      </div>

      {scenario.prompt && (
        <div className="card flex items-center gap-3 p-4">
          {promptClip && <SpeakButton bn={scenario.prompt.bn} size="sm" />}
          <div className="min-w-0">
            <p lang="bn" className="text-2xl font-bold text-pretty [overflow-wrap:anywhere]">
              <WithGap text={scenario.prompt.bn} />
            </p>
            <Translit tr={scenario.prompt.tr} className="text-sm font-semibold" />
            <p className="text-sm font-semibold text-pretty text-muted">{scenario.prompt.en}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3" role="group" aria-label="Answer options">
        {order.map((orig) => {
          const o = scenario.options[orig];
          return (
            <button
              key={orig}
              type="button"
              className="choice"
              data-option-index={orig}
              aria-pressed={selected === orig}
              data-verdict={verdict(orig)}
              data-dim={checked && verdict(orig) === undefined ? "true" : undefined}
              disabled={checked}
              onClick={() => setSelected(orig)}
            >
              <span className="flex min-w-0 flex-col leading-tight text-pretty">
                <span lang="bn" className="text-2xl leading-snug">
                  {o.bn}
                </span>
                <Translit tr={o.tr} inButton className="text-sm font-semibold" />
                {checked && <span className="mt-0.5 text-sm font-semibold">{o.en}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {checked && selected !== null && (
          <section
            data-testid="formality-feedback"
            data-correct={correct ? "true" : "false"}
            className={`rounded-3xl border-2 p-4 ${correct ? "border-brand/40 bg-brand-light" : "border-accent/40 bg-accent-light"}`}
          >
            <p className={`text-xl font-black ${correct ? "text-brand-dark" : "text-accent-dark"}`}>
              {correct ? (scenario.answer.length > 1 ? "Correct! More than one works." : "Correct!") : "Not quite."}
            </p>
            <p className="mt-1 font-semibold text-pretty text-ink">{scenario.why}</p>
            {scenario.varies && <p className="mt-2 text-sm font-bold text-pretty text-ink">{scenario.varies}</p>}
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-black tracking-wide text-muted uppercase">
                {scenario.answer.length > 1 ? "Good answers" : "Good answer"}
              </p>
              {scenario.answer.map((a) => {
                const o = scenario.options[a];
                return (
                  <div key={a} className="flex items-center gap-3">
                    {hasRecording(o.bn) && <SpeakButton bn={o.bn} size="sm" />}
                    <div className="min-w-0">
                      <p lang="bn" className="text-lg font-bold [overflow-wrap:anywhere]">
                        {o.bn}
                      </p>
                      <p className="text-sm font-semibold text-muted">
                        <Translit tr={o.tr} /> · {o.en}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {scenario.notes && (
              <p className="mt-3 text-sm font-semibold text-pretty text-muted">
                <span className="font-black">Regional note: </span>
                {scenario.notes}
              </p>
            )}
          </section>
        )}
      </div>

      <div>
        {checked ? (
          <button
            ref={continueRef}
            type="button"
            className={`btn w-full ${correct ? "btn-primary" : "btn-danger"}`}
            onClick={() => selected !== null && onDone(selected, correct)}
          >
            {index + 1 >= total ? "See results" : "Continue"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary w-full" disabled={selected === null} onClick={() => setChecked(true)}>
            Check
          </button>
        )}
      </div>
    </div>
  );
}
