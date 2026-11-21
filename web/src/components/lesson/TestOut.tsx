"use client";

import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { HeartIcon } from "./HeartIcon";
import type { TestOutInfo } from "@/lib/checkpoint";
import type { Lesson } from "@/lib/types";

export interface TestOutOutcome {
  passed: boolean;
  firstTry: number;
  total: number;
  /** First-try answers needed to pass. */
  needed: number;
  outOfHearts: boolean;
  /** Lessons newly marked done (0 unless passed). */
  newlyMarked: number;
}

/** Explains the rules before a test-out starts. */
export function TestOutIntro({
  lesson,
  info,
  needed,
  total,
  hearts,
  onStart,
}: {
  lesson: Lesson;
  info: TestOutInfo;
  needed: number;
  total: number;
  hearts: number;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-xl items-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-1 py-1 font-extrabold text-muted transition-colors hover:text-ink">
          <span aria-hidden>←</span> Back to the map
        </Link>
      </header>
      <main className="animate-rise mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pt-6 pb-36">
        <div>
          <p className="chip mb-2 bg-brand-light text-brand-dark">Test out</p>
          <h1 className="text-3xl leading-tight font-black text-balance">Test out of {info.label}</h1>
          <p className="mt-2 font-semibold text-pretty text-muted">{lesson.title}</p>
        </div>
        <ul className="card flex flex-col divide-y-2 divide-line overflow-hidden font-bold">
          <li className="px-4 py-3">
            Get at least {needed} of {total} right the first time.
          </li>
          <li className="px-4 py-3">
            Keep at least one of your {hearts} hearts.
          </li>
          <li className="px-4 py-3">
            Pass, and the {info.covered.length - 1} lessons before this checkpoint are marked done. They give no XP or
            stars, and you can still practise any of them.
          </li>
          <li className="px-4 py-3">Do not pass, and nothing changes. You can try again whenever you like.</li>
        </ul>
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-xl px-4 pt-4 pb-4">
          <button type="button" autoFocus className="btn btn-primary w-full" onClick={onStart}>
            Start the test
          </button>
        </div>
      </footer>
    </div>
  );
}

/** End screen of a test-out run: pass, or an encouraging "not yet" that changes nothing. */
export function TestOutResult({
  info,
  outcome,
  onRetry,
}: {
  info: TestOutInfo;
  outcome: TestOutOutcome;
  onRetry: () => void;
}) {
  const { passed, firstTry, total, needed, outOfHearts, newlyMarked } = outcome;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 bg-surface px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <div
        className={`animate-medal flex h-32 w-32 items-center justify-center rounded-full ${passed ? "bg-brand text-white" : "bg-sun-light text-sun-dark"}`}
        aria-hidden
      >
        {passed ? <CheckIcon size={64} /> : <HeartIcon size={64} />}
      </div>
      <div className="animate-rise">
        <h1 className="text-3xl font-black text-balance">
          {passed ? `Tested out of ${info.label}` : "Not this time"}
        </h1>
        {passed ? (
          <p className="mx-auto mt-1 max-w-sm font-semibold text-pretty text-muted">
            <span lang="bn" className="font-bold text-ink">শাবাশ!</span> (shabash: well done!){" "}
            {newlyMarked > 0
              ? `${newlyMarked} ${newlyMarked === 1 ? "lesson is" : "lessons are"} marked done on your map.`
              : "Everything here was already done."}
          </p>
        ) : (
          <p className="mx-auto mt-1 max-w-sm font-semibold text-pretty text-muted">
            {outOfHearts
              ? "You ran out of hearts, which is a sign some of this is still settling in."
              : `You got ${firstTry} of ${total} right the first time and needed ${needed}. That is close enough to be worth another go.`}{" "}
            Nothing on your map has changed. Play the lessons at your own pace, or try again when you are ready.
          </p>
        )}
      </div>
      {passed && (
        <p className="rounded-2xl bg-brand-light px-4 py-3 font-bold text-brand-dark" role="status">
          {firstTry} of {total} right first time
        </p>
      )}
      <div className="flex w-full max-w-sm flex-col gap-3">
        {passed ? (
          <>
            <Link href="/" autoFocus className="btn btn-primary w-full">
              Back to the map
            </Link>
          </>
        ) : (
          <>
            <button type="button" autoFocus className="btn btn-primary w-full" onClick={onRetry}>
              Try again
            </button>
            <Link href="/" className="btn btn-ghost w-full">
              Back to the map
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
