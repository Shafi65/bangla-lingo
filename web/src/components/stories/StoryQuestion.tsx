"use client";

import type { RefObject } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import { Inline } from "@/components/lesson/MiniMarkdown";
import type { StoryQuestion as StoryQuestionT } from "@/lib/stories/types";

/** A comprehension question: tap an option to answer (one try), then the verdict and the "why". */
export function StoryQuestion({
  q,
  index,
  order,
  chosen,
  onAnswer,
  headingRef,
}: {
  q: StoryQuestionT;
  index: number;
  /** Display slot -> authored option index. */
  order: number[];
  /** Authored index of the chosen option, once answered. */
  chosen: number | undefined;
  onAnswer: (optionIndex: number) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const answered = chosen !== undefined;
  const right = answered && chosen === q.answer;
  const bengali = q.options.every((o) => o.bn);
  const headingId = `story-q-${index}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="story-question"
      data-question-index={index}
      className="card flex flex-col gap-3 border-sun/50 bg-sun-light/40 p-4"
    >
      <p className="text-xs font-black tracking-wide text-sun-dark uppercase">Question</p>
      {q.questionBn ? (
        <div className="flex items-center gap-3">
          <SpeakButton bn={q.questionBn.bn} size="sm" />
          <div className="min-w-0">
            <h2 id={headingId} ref={headingRef} tabIndex={-1} lang="bn" className="text-2xl font-black text-pretty outline-none [overflow-wrap:anywhere]">
              {q.questionBn.bn}
            </h2>
            <div className="text-sm font-semibold">
              <Translit tr={q.questionBn.tr} />
            </div>
            <p className="font-semibold text-pretty text-muted">{q.question}</p>
          </div>
        </div>
      ) : (
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-xl font-black text-pretty outline-none">
          {q.question}
        </h2>
      )}
      <ul className="flex flex-col gap-2" aria-label="Answers">
        {order.map((oi) => {
          const o = q.options[oi];
          const verdict = answered ? (oi === q.answer ? "right" : oi === chosen ? "wrong" : undefined) : undefined;
          return (
            <li key={oi}>
              <button
                type="button"
                data-option-index={oi}
                disabled={answered}
                aria-pressed={answered ? oi === chosen : undefined}
                data-verdict={verdict}
                data-dim={answered && !verdict ? "true" : undefined}
                onClick={() => onAnswer(oi)}
                className="choice"
              >
                {bengali && o.bn ? (
                  <span className="flex min-w-0 flex-col">
                    <span lang="bn" className="text-xl">
                      {o.bn.bn}
                    </span>
                    <span className="text-sm font-semibold">
                      <Translit tr={o.bn.tr} inButton />
                    </span>
                    {answered && <span className="text-sm font-semibold opacity-80">{o.bn.en}</span>}
                  </span>
                ) : (
                  o.text
                )}
                {verdict && <span className="sr-only">{verdict === "right" ? " (correct answer)" : " (your answer)"}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite">
        {answered && (
          <div
            data-testid="story-feedback"
            data-correct={right ? "true" : "false"}
            className={`rounded-2xl px-3 py-2 ${right ? "bg-brand-light text-brand-dark" : "bg-accent-light text-accent-dark"}`}
          >
            <p className="font-black">{right ? "Correct!" : "Not quite."}</p>
            <p className="text-sm font-semibold text-pretty text-ink">
              <Inline text={q.why} />
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
