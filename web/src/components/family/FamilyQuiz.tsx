"use client";

import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import { buildQuiz, seededRandom, type QuizQuestion } from "@/lib/family/quiz";
import { updateFamily } from "@/lib/family/storage";
import type { FamilyStore, KinData } from "@/lib/family/types";

/**
 * "Practice my family": a short round about the learner's own relatives. The score is kept in
 * banglalingo.family.v1 only (no XP, streak or lesson progress).
 */
export function FamilyQuiz({
  kin,
  store,
  headingRef,
  onDone,
}: {
  kin: KinData;
  store: FamilyStore;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDone: () => void;
}) {
  // Built once per round, from an event-time seed (never during prerender).
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<{ before: number } | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random round, client only
    setQuestions(buildQuiz(kin, store, seededRandom(Math.floor(Math.random() * 2 ** 31))));
    // Only once per mount: later store writes (the score) must not rebuild the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (checked) continueRef.current?.focus();
  }, [checked]);
  useEffect(() => {
    if (i > 0) qRef.current?.focus();
  }, [i]);

  const total = questions?.length ?? 0;
  const done = questions !== null && i >= total;
  const q = questions && !done ? questions[i] : undefined;
  const correct = checked && q && selected !== null && q.answer.includes(selected);

  const next = () => {
    const s = score + (correct ? 1 : 0);
    setScore(s);
    setSelected(null);
    setChecked(false);
    if (questions && i + 1 >= questions.length) {
      let before = 0;
      updateFamily((st) => {
        before = st.quiz.best;
        return { ...st, quiz: { rounds: st.quiz.rounds + 1, best: Math.max(st.quiz.best, s) } };
      });
      setBest({ before });
    }
    setI(i + 1);
  };

  if (!questions) return <div className="skeleton h-64" aria-hidden />;

  if (done || total === 0) {
    return (
      <div className="flex flex-col gap-4" data-testid="family-quiz-summary">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black outline-none">
          {total === 0 ? "Add a relative first" : "Round complete"}
        </h1>
        {total > 0 && (
          <p className="text-xl font-bold" data-testid="family-quiz-score">
            {score} / {total}
            {best && score > best.before && best.before > 0 ? " · New best!" : ""}
          </p>
        )}
        <p className="font-semibold text-muted">Practice uses your own family, so it changes as you add people.</p>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Back to my family
        </button>
      </div>
    );
  }

  const verdict = (k: number) => (!checked ? undefined : q!.answer.includes(k) ? "right" : k === selected ? "wrong" : undefined);

  return (
    <div className="flex flex-col gap-5" data-testid="family-quiz" data-type={q!.type}>
      <div className="flex items-center justify-between gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-black outline-none">
          Practice my family
        </h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Stop
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={i}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(i / total) * 100}%` }} />
        </div>
        <span className="text-sm font-extrabold text-muted tabular-nums">
          {i + 1} / {total}
        </span>
      </div>
      <h2 ref={qRef} tabIndex={-1} className="text-xl font-black text-pretty outline-none" data-testid="family-quiz-prompt">
        {q!.prompt}
      </h2>
      <div className="grid gap-3" role="group" aria-label="Answer options">
        {q!.options.map((o, k) => (
          <button
            key={`${o.bn}-${k}`}
            type="button"
            className="choice"
            data-option-index={k}
            data-correct={q!.answer.includes(k) ? "true" : undefined}
            aria-pressed={selected === k}
            data-verdict={verdict(k)}
            data-dim={checked && verdict(k) === undefined ? "true" : undefined}
            disabled={checked}
            onClick={() => setSelected(k)}
          >
            <span className="flex min-w-0 flex-col leading-tight">
              <span lang="bn" className="text-2xl leading-snug">
                {o.bn}
              </span>
              {o.tr && <Translit tr={o.tr} inButton className="text-sm font-semibold" />}
            </span>
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {checked && (
          <section
            data-testid="family-quiz-feedback"
            data-correct={correct ? "true" : "false"}
            className={`rounded-3xl border-2 p-4 ${correct ? "border-brand/40 bg-brand-light" : "border-accent/40 bg-accent-light"}`}
          >
            <p className={`text-xl font-black ${correct ? "text-brand-dark" : "text-accent-dark"}`}>{correct ? "Correct!" : "Not quite."}</p>
            <div className="mt-2 flex items-center gap-3">
              {/[ঀ-৿]/.test(q!.options[q!.answer[0]].bn) && <SpeakButton bn={q!.options[q!.answer[0]].bn} size="sm" />}
              <p className="font-semibold text-pretty text-ink">{q!.why}</p>
            </div>
          </section>
        )}
      </div>
      {!checked ? (
        <button type="button" className="btn btn-primary" disabled={selected === null} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <button ref={continueRef} type="button" className="btn btn-primary" onClick={next}>
          {i + 1 >= total ? "See results" : "Continue"}
        </button>
      )}
    </div>
  );
}
