"use client";

import { useId, type RefObject } from "react";
import type { Background, BackgroundQuestion } from "@/lib/placement/types";

/** The unscored background questions, as rows of pill-shaped radio buttons. All optional. */
export function BackgroundForm({
  headingRef,
  questions,
  value,
  onChange,
  onContinue,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  questions: BackgroundQuestion[];
  value: Background;
  onChange: (next: Background) => void;
  onContinue: () => void;
}) {
  const uid = useId();
  return (
    <div className="animate-rise flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl leading-tight font-black text-balance outline-none">
          A little about you
        </h1>
        <p className="font-semibold text-pretty text-muted">
          Optional. These decide which questions come first; they never change your score. They stay on this device.
        </p>
      </div>
      {questions.map((q) => {
        const name = `${uid}-${q.id}`;
        return (
          <fieldset key={q.id} className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-lg font-black text-pretty">{q.text}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const checked = value[q.id] === o.id;
                return (
                  <label
                    key={o.id}
                    data-checked={checked}
                    className="press inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-line-strong bg-surface px-4 py-1.5 font-bold text-ink [--lip-h:3px] [--lip:var(--color-line-strong)] hover:bg-sunk has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-[checked=true]:border-brand data-[checked=true]:bg-brand-light data-[checked=true]:text-brand-dark data-[checked=true]:[--lip:var(--color-brand)]"
                  >
                    <input
                      type="radio"
                      name={name}
                      value={o.id}
                      checked={checked}
                      onChange={() => onChange({ ...value, [q.id]: o.id })}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <div className="sticky bottom-0 -mx-5 mt-auto bg-paper/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button type="button" className="btn btn-primary w-full" onClick={onContinue}>
          Start the test
        </button>
      </div>
    </div>
  );
}
