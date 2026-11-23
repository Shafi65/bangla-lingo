"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DraftNotice } from "@/components/DraftNotice";
import { LockIcon } from "@/components/icons";
import { Translit } from "@/components/Translit";
import { useProgress } from "@/lib/progress";
import { buildSteps, isStoryUnlocked, scoreMessage, shuffledOrder } from "@/lib/stories/engine";
import { readStories, recordFinish, writeStories } from "@/lib/stories/storage";
import type { Story, StorySummary } from "@/lib/stories/types";
import { StoryLine } from "./StoryLine";
import { StoryQuestion } from "./StoryQuestion";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Reads a story line by line ("Continue"), with comprehension questions after their lines and an
 * end screen with the score. Completion goes to banglalingo.stories.v1 only: no XP, streak or
 * lesson progress changes.
 */
export function StoryPlayer({ story, next }: { story: Story; next?: StorySummary }) {
  const progress = useProgress();
  const hydrated = useHydrated();
  const steps = useMemo(() => buildSteps(story), [story]);
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [orders, setOrders] = useState<Record<number, number[]>>({});
  const [finished, setFinished] = useState(false);
  const [live, setLive] = useState("");
  const continueRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const focusQuestion = useRef(false);

  const current = steps[pos];
  const waiting = current?.kind === "question" && answers[current.question] === undefined;
  const score = story.questions.filter((q, i) => answers[i] === q.answer).length;
  const isLast = pos >= steps.length - 1;

  useEffect(() => {
    if (finished) {
      endRef.current?.focus();
      window.scrollTo({ top: 0 });
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lastRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    if (focusQuestion.current) {
      focusQuestion.current = false;
      questionRef.current?.focus();
    }
  }, [pos, finished]);

  if (hydrated && !isStoryUnlocked(story, progress.completed)) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
        <span aria-hidden className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-sunk text-muted">
          <LockIcon size={34} />
        </span>
        <h1 className="text-2xl font-black text-balance">This story is locked</h1>
        <p className="font-semibold text-pretty text-muted">
          Finish the first lesson of Unit {story.unitNumber} ({story.unitTitle}) to read &ldquo;{story.title.en}&rdquo;.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          {story.firstLessonId && (
            <Link href={`/lesson/${story.firstLessonId}`} className="btn btn-primary">
              Go to the lesson
            </Link>
          )}
          <Link href="/stories" className="btn btn-ghost">
            All stories
          </Link>
        </div>
      </main>
    );
  }

  const advance = () => {
    if (waiting) return;
    if (isLast) {
      const total = story.questions.length;
      writeStories(recordFinish(readStories(), story.id, score, total));
      setLive(`Story complete. ${score} of ${total} correct.`);
      setFinished(true);
      return;
    }
    const step = steps[pos + 1];
    if (step.kind === "question") {
      const q = story.questions[step.question];
      setOrders((o) => (o[step.question] ? o : { ...o, [step.question]: shuffledOrder(q.options.length) }));
      setLive(`Question: ${q.questionBn ? `${q.questionBn.bn}. ` : ""}${q.question}`);
      focusQuestion.current = true;
    } else {
      const l = story.lines[step.line];
      setLive(`${l.speaker ? `${l.speaker}: ` : ""}${l.bn}`);
    }
    setPos(pos + 1);
  };

  const answer = (qi: number, oi: number) => {
    if (answers[qi] !== undefined) return;
    setAnswers((a) => ({ ...a, [qi]: oi }));
    setLive(oi === story.questions[qi].answer ? "Correct." : "Not quite.");
    window.setTimeout(() => continueRef.current?.focus(), 0);
  };

  const restart = () => {
    setPos(0);
    setAnswers({});
    setOrders({});
    setFinished(false);
    setLive("");
  };

  const progressPct = finished ? 100 : Math.round(((pos + 1) / steps.length) * 100);
  const nextOpen = next && hydrated && isStoryUnlocked(next, progress.completed);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b-2 border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <Link
            href="/stories"
            aria-label="Close story, back to all stories"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunk"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </Link>
          <div
            role="progressbar"
            aria-label="Story progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            className="h-4 flex-1 overflow-hidden rounded-full bg-sunk"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      <p className="sr-only" aria-live="polite" data-testid="story-live">
        {live}
      </p>

      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-40">
        {finished ? (
          <section className="flex flex-col items-center gap-4 pt-6 text-center" data-testid="story-end">
            <div className="kantha-edge flex h-32 min-w-32 items-center justify-center rounded-full bg-brand-light px-8 [--radius-panel:9999px] [--stitch:color-mix(in_oklab,var(--color-brand)_40%,transparent)]">
              <span className="text-4xl font-black text-brand-dark" data-testid="story-score">
                {score}/{story.questions.length}
              </span>
            </div>
            <h1 ref={endRef} tabIndex={-1} className="text-3xl font-black text-balance outline-none">
              Story complete
            </h1>
            <p className="font-semibold text-pretty text-muted">
              You read &ldquo;{story.title.en}&rdquo; and answered {score} of {story.questions.length} questions correctly.{" "}
              {scoreMessage(score, story.questions.length)}
            </p>
            <div className="flex w-full max-w-xs flex-col gap-3">
              {nextOpen && next ? (
                <Link href={`/stories/${next.id}`} className="btn btn-primary">
                  Next story
                </Link>
              ) : null}
              <button type="button" onClick={restart} className={`btn ${nextOpen ? "btn-ghost" : "btn-primary"}`}>
                Read again
              </button>
              <Link href="/stories" className="btn btn-ghost">
                All stories
              </Link>
            </div>
            {story.draft && <DraftNotice className="mt-2" />}
          </section>
        ) : (
          <>
            <div className="mb-5">
              <p className="text-xs font-black tracking-wide text-muted uppercase">
                Story · Unit {story.unitNumber}
              </p>
              <h1 lang="bn" className="text-3xl font-black text-pretty [overflow-wrap:anywhere]">
                {story.title.bn}
              </h1>
              <div className="text-sm font-semibold">
                <Translit tr={story.title.tr} />
              </div>
              <p className="font-bold text-ink">{story.title.en}</p>
              <p className="mt-1 text-sm font-semibold text-muted">Tap any underlined word to see what it means.</p>
            </div>
            <ol className="flex flex-col gap-3" aria-label="Story so far">
              {steps.slice(0, pos + 1).map((s, i) => (
                <li key={i} ref={i === pos ? lastRef : undefined}>
                  {s.kind === "line" ? (
                    <StoryLine line={story.lines[s.line]} index={s.line} active={i === pos} />
                  ) : (
                    <StoryQuestion
                      q={story.questions[s.question]}
                      index={s.question}
                      order={orders[s.question] ?? story.questions[s.question].options.map((_, k) => k)}
                      chosen={answers[s.question]}
                      onAnswer={(oi) => answer(s.question, oi)}
                      headingRef={i === pos ? questionRef : undefined}
                    />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      {!finished && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-bold text-muted">
              {waiting ? "Choose an answer to go on." : `Line ${countLines(steps, pos)} of ${story.lines.length}`}
            </p>
            <button
              ref={continueRef}
              type="button"
              onClick={advance}
              disabled={waiting}
              className="btn btn-primary shrink-0"
              data-testid="story-continue"
            >
              {isLast ? "Finish" : "Continue"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function countLines(steps: ReturnType<typeof buildSteps>, pos: number): number {
  return steps.slice(0, pos + 1).filter((s) => s.kind === "line").length;
}
