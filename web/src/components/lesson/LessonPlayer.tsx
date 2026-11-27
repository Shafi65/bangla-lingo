"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkAnswer, type Response } from "@/lib/answers";
import { recordExerciseResult } from "@/lib/memory";
import { firstTryNeeded, testOutPassed, type TestOutInfo } from "@/lib/checkpoint";
import { progressStore, todayXp } from "@/lib/progress";
import { playSfx, preloadSfx } from "@/lib/sfx";
import { readGame, recordGameEvent } from "@/lib/game/storage";
import { boostActive, COMBO_EVERY } from "@/lib/game/engine";
import type { Exercise, Lesson } from "@/lib/types";
import { BnText } from "@/components/BnText";
import { ScriptOnlyContext, useIsScriptLesson } from "@/components/CourseContext";
import type { TranslitMap } from "@/lib/translit";
import { Done, type DoneSummary } from "./Done";
import { TestOutIntro, TestOutResult, type TestOutOutcome } from "./TestOut";
import { Feedback } from "./Feedback";
import { LessonEnvContext } from "./LessonEnv";
import { MiniMarkdown } from "./MiniMarkdown";
import { TipDialog } from "./TipDialog";
import { FillBlank } from "./exercises/FillBlank";
import { ListenMeaning } from "./exercises/ListenMeaning";
import { ListenSelect } from "./exercises/ListenSelect";
import { MatchPairs } from "./exercises/MatchPairs";
import { ScriptRecognize } from "./exercises/ScriptRecognize";
import { Reading } from "./exercises/Reading";
import { SelectTranslation } from "./exercises/SelectTranslation";
import { TypeTranslation } from "./exercises/TypeTranslation";
import { WordBank } from "./exercises/WordBank";
import type { ExerciseProps } from "./exercises/types";
import { HeartIcon } from "./HeartIcon";

export const MAX_HEARTS = 5;
const XP_COMPLETE = 10;
const XP_PRACTICE = 5;
const XP_PER_FIRST_TRY = 1;

export type PlayerMode = "lesson" | "practice";

/** Exercises where the learner types the answer (they count for "typed" quests and badges). */
const isTyped = (ex: Exercise) => ex.type === "type_translation" || (ex.type === "fill_blank" && !ex.options);

export function LessonPlayer({
  lesson,
  mode = "lesson",
  translit,
  testOut,
  onExit,
}: {
  lesson: Lesson;
  mode?: PlayerMode;
  /** Set (checkpoint lessons only) to run the lesson as a test-out of the lessons it covers. */
  testOut?: TestOutInfo;
  /** Transliteration for Bengali options/tiles (see lib/translit.ts). */
  translit?: TranslitMap;
  /** Practice: called by "Back" on the end screen instead of linking home. */
  onExit?: () => void;
}) {
  // Bumping `attempt` remounts the run with fresh state (retry).
  const [attempt, setAttempt] = useState(0);
  return (
    <ScriptOnlyContext.Provider value={mode === "lesson" && lesson.scriptOnly === true}>
      <LessonRun
        key={attempt}
        lesson={lesson}
        mode={mode}
        translit={translit}
        testOut={mode === "lesson" ? testOut : undefined}
        onRetry={() => setAttempt((a) => a + 1)}
        onExit={onExit}
      />
    </ScriptOnlyContext.Provider>
  );
}

type Phase = "intro" | "play" | "done" | "out";

function LessonRun({
  lesson,
  mode,
  translit,
  testOut,
  onRetry,
  onExit,
}: {
  lesson: Lesson;
  mode: PlayerMode;
  translit?: TranslitMap;
  testOut?: TestOutInfo;
  onRetry: () => void;
  onExit?: () => void;
}) {
  const total = lesson.exercises.length;
  const hasIntro = mode === "lesson" && (!!testOut || !!lesson.tip || lesson.vocab.length > 0);

  const [phase, setPhase] = useState<Phase>(hasIntro ? "intro" : "play");
  const [queue, setQueue] = useState<number[]>(() => lesson.exercises.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [response, setResponse] = useState<Response | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  /** Accepted spelling when the last answer was right apart from a typo. */
  const [typo, setTypo] = useState<string | null>(null);
  const [missed, setMissed] = useState<Set<number>>(() => new Set());
  const [solved, setSolved] = useState(0);
  const [summary, setSummary] = useState<DoneSummary | null>(null);
  const [outcome, setOutcome] = useState<TestOutOutcome | null>(null);
  /** Right answers in a row (resets on a miss). */
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  /** Coins earned by answers during this run (combo bonuses). */
  const runCoins = useRef(0);

  useEffect(() => preloadSfx(), []);

  const [tipOpen, setTipOpen] = useState(false);
  const [footerRef, footerH] = useElementHeight<HTMLElement>(120);

  const exIndex = queue[pos];
  const ex = lesson.exercises[exIndex];
  const scriptTrack = useIsScriptLesson(mode === "practice" ? ex.id : lesson.id);
  const env = useMemo(() => ({ translit: translit ?? {}, scriptTrack }), [translit, scriptTrack]);

  const check = useCallback(() => {
    if (!response || result !== null) return;
    const checked = checkAnswer(ex, response);
    const ok = checked.correct;
    setResult(ok);
    setTypo(checked.typo ?? null);
    // Spaced-review memory. Practice exercises carry "<lessonId>:<exerciseId>"
    // ids; report them under their source lesson and original id. A test-out leaves no trace.
    if (!testOut) try {
      const colon = mode === "practice" ? ex.id.indexOf(":") : -1;
      if (colon > 0) recordExerciseResult(ex.id.slice(0, colon), { ...ex, id: ex.id.slice(colon + 1) }, ok);
      else recordExerciseResult(lesson.id, ex, ok);
    } catch {
      // memory is best-effort; never break the lesson
    }
    const nextCombo = ok ? combo + 1 : 0;
    setCombo(nextCombo);
    if (ok) setBestCombo((b) => Math.max(b, nextCombo));
    playSfx(!ok ? "wrong" : nextCombo % COMBO_EVERY === 0 ? "combo" : "correct");
    if (!testOut) {
      const r = recordGameEvent({ type: "answer", correct: ok, typed: isTyped(ex), combo: nextCombo });
      runCoins.current += r?.coins ?? 0;
    }
    if (ok) {
      setSolved((s) => s + 1);
    } else {
      setHearts((h) => h - 1);
      setMissed((m) => new Set(m).add(exIndex));
      setQueue((q) => [...q, exIndex]); // retry at the end
    }
  }, [response, result, ex, exIndex, lesson.id, mode, testOut, combo]);

  const advance = useCallback(() => {
    if (result === null) return;
    if (!result && hearts <= 0) {
      if (testOut) setOutcome({ passed: false, firstTry: total - missed.size, total, needed: firstTryNeeded(total), outOfHearts: true, newlyMarked: 0 });
      setPhase("out");
      return;
    }
    const next = pos + 1;
    if (next >= queue.length && testOut) {
      // Test-out: pass = a heart left and 80 % right first time. Nothing is recorded unless it passes,
      // and a pass records no XP, streak or stars: it only marks the covered lessons done.
      const firstTry = total - missed.size;
      const passed = testOutPassed({ heartsLeft: hearts, firstTry, total });
      const before = progressStore.get().completed;
      if (passed) progressStore.completeLessons(testOut.covered, { source: "checkpoint" });
      playSfx(passed ? "complete" : "wrong");
      setOutcome({
        passed,
        firstTry,
        total,
        needed: firstTryNeeded(total),
        outOfHearts: false,
        newlyMarked: passed ? testOut.covered.filter((id) => !before[id]).length : 0,
      });
      setPhase("done");
      return;
    }
    if (next >= queue.length) {
      const firstTry = total - missed.size;
      // A review boost from the shop doubles practice XP while it runs.
      const boosted = mode === "practice" && boostActive(readGame(), Date.now());
      const xp = ((mode === "practice" ? XP_PRACTICE : XP_COMPLETE) + firstTry * XP_PER_FIRST_TRY) * (boosted ? 2 : 1);
      const accuracy = total ? firstTry / total : 1;
      const before = progressStore.get();
      const xpBefore = todayXp(before);
      const after =
        mode === "practice"
          ? progressStore.recordPractice(xp)
          : progressStore.completeLesson(lesson.id, xp, accuracy);
      const streakGrew = after.streak > before.streak;
      const game = recordGameEvent({ type: "lesson", mode, xp, perfect: missed.size === 0, streak: after.streak });
      playSfx(streakGrew && after.streak > 1 ? "streak" : "complete");
      setSummary({
        xp,
        accuracy,
        goal: after.settings.dailyGoal,
        xpToday: todayXp(after),
        goalJustMet: xpBefore < after.settings.dailyGoal && todayXp(after) >= after.settings.dailyGoal,
        streak: after.streak,
        streakGrew,
        coins: runCoins.current + (game?.coins ?? 0),
        questsDone: game?.questsDone ?? [],
        freeFreeze: game?.freeFreeze ?? false,
        bestCombo,
        goalReached: game?.goalReached ?? 0,
        boosted,
      });
      setPhase("done");
      return;
    }
    setPos(next);
    setResponse(null);
    setResult(null);
    setTypo(null);
  }, [result, hearts, pos, queue.length, total, missed.size, mode, lesson.id, testOut, bestCombo]);

  // Enter = Check / Continue, wherever focus is (except links, text fields
  // and controls that need Enter themselves).
  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("a, textarea, input, dialog, [data-enter-native]")) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (result === null) check();
      else advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, result, check, advance]);

  const exitHref = mode === "practice" ? "/practice" : "/";

  if (phase === "intro" && testOut) {
    return <TestOutIntro lesson={lesson} info={testOut} needed={firstTryNeeded(total)} total={total} hearts={MAX_HEARTS} onStart={() => setPhase("play")} />;
  }
  if (phase === "intro") {
    return <Intro lesson={lesson} onStart={() => setPhase("play")} />;
  }
  if (testOut && outcome && (phase === "done" || phase === "out")) {
    return <TestOutResult info={testOut} outcome={outcome} onRetry={onRetry} />;
  }
  if (phase === "done" && summary) {
    return <Done title={mode === "practice" ? "Practice complete" : "Lesson complete"} subtitle={lesson.title} summary={summary} onExit={onExit} onRetry={onRetry} />;
  }
  if (phase === "out") {
    return <OutOfHearts onRetry={onRetry} exitHref={exitHref} onExit={onExit} />;
  }

  const props: ExerciseProps<Exercise> = {
    ex,
    locked: result !== null,
    onChange: setResponse,
    onSubmit: () => (result === null ? check() : advance()),
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <TopBar
        hearts={hearts}
        progress={solved / total}
        exitHref={exitHref}
        onExit={onExit}
        onTip={mode === "lesson" && lesson.tip && !testOut ? () => setTipOpen(true) : undefined}
        testOut={!!testOut}
        combo={combo}
      />
      {tipOpen && lesson.tip && <TipDialog tip={lesson.tip} onClose={() => setTipOpen(false)} />}

      <main
        className="mx-auto w-full max-w-xl flex-1 px-4 pt-6"
        // Reserve exactly the footer's height, so the feedback sheet never covers the last option.
        style={{ paddingBottom: footerH + 24 }}
      >
        {pos >= total && (
          <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-accent-dark">
            <span aria-hidden>↻</span> Another go at one you missed
          </p>
        )}
        {/* key: remount each queue slot so per-exercise state resets on retries */}
        <div key={pos} className="animate-enter">
          {/* A gentle shake on a wrong answer. */}
          <motion.div
            animate={result === false ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <LessonEnvContext.Provider value={env}>
              <ExerciseView {...props} />
            </LessonEnvContext.Provider>
          </motion.div>
        </div>
      </main>

      <ActionBar
        footerRef={footerRef}
        result={result}
        hint={
          ex.type === "type_translation" || (ex.type === "fill_blank" && !ex.options)
            ? "Press Enter to check"
            : ex.type === "match_pairs"
              ? "Match every pair, then check"
              : ex.type === "word_bank"
                ? "Tap words to build your answer. Backspace removes the last one."
                : "Pick with the number keys, press Enter to check"
        }
        feedback={
          result !== null ? (
            <Feedback ex={ex} correct={result} typo={typo} lessonId={mode === "practice" ? ex.id.split(":")[0] : lesson.id} />
          ) : null
        }
        canCheck={!!response}
        onCheck={check}
        onContinue={advance}
      />
    </div>
  );
}

/**
 * Sticky bottom bar: Check, then the feedback sheet with Continue. Fixed to the
 * viewport with safe-area padding; its height is reported so the page reserves room.
 */
function ActionBar({
  footerRef,
  result,
  hint,
  feedback,
  canCheck,
  onCheck,
  onContinue,
}: {
  footerRef: (el: HTMLElement | null) => void;
  result: boolean | null;
  hint: string;
  feedback: ReactNode;
  canCheck: boolean;
  onCheck: () => void;
  onContinue: () => void;
}) {
  const tone =
    result === null
      ? "border-line bg-surface"
      : result
        ? "animate-sheet border-brand/25 bg-brand-light"
        : "animate-sheet border-accent/25 bg-accent-light";
  return (
    <footer
      ref={footerRef}
      className={`fixed inset-x-0 bottom-0 z-10 border-t-2 pb-[env(safe-area-inset-bottom)] transition-colors ${tone}`}
      style={result === null ? undefined : { boxShadow: "var(--shadow-sheet)" }}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4 pb-4 sm:flex-row sm:items-end sm:justify-between sm:pt-5">
        <div className="min-w-0 flex-1">
          {feedback ?? <p className="hidden text-sm font-semibold text-muted sm:block">{hint}</p>}
        </div>
        {result === null ? (
          <motion.button
            type="button"
            className="btn btn-primary w-full sm:w-44"
            disabled={!canCheck}
            onClick={onCheck}
            whileTap={canCheck ? { scale: 0.96 } : undefined}
          >
            Check
          </motion.button>
        ) : (
          <motion.button
            type="button"
            autoFocus
            className={`btn w-full sm:w-44 ${result ? "btn-primary" : "btn-danger"}`}
            onClick={onContinue}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            whileTap={{ scale: 0.96 }}
          >
            Continue
          </motion.button>
        )}
      </div>
    </footer>
  );
}

/** Live height of an element (for reserving space under a fixed footer). */
function useElementHeight<T extends HTMLElement>(fallback: number) {
  const [h, setH] = useState(fallback);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    setH(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(() => setH(el.offsetHeight));
    ro.current.observe(el);
  }, []);
  return [ref, h] as const;
}

function ExerciseView(props: ExerciseProps<Exercise>) {
  const { ex } = props;
  switch (ex.type) {
    case "select_translation":
      return <SelectTranslation {...props} ex={ex} />;
    case "word_bank":
      return <WordBank {...props} ex={ex} />;
    case "match_pairs":
      return <MatchPairs {...props} ex={ex} />;
    case "listen_select":
      return <ListenSelect {...props} ex={ex} />;
    case "type_translation":
      return <TypeTranslation {...props} ex={ex} />;
    case "script_recognize":
      return <ScriptRecognize {...props} ex={ex} />;
    case "fill_blank":
      return <FillBlank {...props} ex={ex} />;
    case "listen_meaning":
      return <ListenMeaning {...props} ex={ex} />;
    case "reading":
      return <Reading {...props} ex={ex} />;
  }
}

function ExitControl({
  exitHref,
  onExit,
  className,
  children,
  label,
}: {
  exitHref: string;
  onExit?: () => void;
  className: string;
  children: ReactNode;
  label?: string;
}) {
  if (onExit) {
    return (
      <button type="button" aria-label={label} className={className} onClick={onExit}>
        {children}
      </button>
    );
  }
  return (
    <Link href={exitHref} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

function TopBar({
  hearts,
  progress,
  exitHref,
  onExit,
  onTip,
  testOut = false,
  combo = 0,
}: {
  hearts: number;
  progress: number;
  exitHref: string;
  onExit?: () => void;
  onTip?: () => void;
  testOut?: boolean;
  combo?: number;
}) {
  const pct = Math.round(progress * 100);
  return (
    <header className="sticky top-0 z-10 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3 sm:gap-4 sm:pt-5">
        <ExitControl
          exitHref={exitHref}
          onExit={onExit}
          label="Quit"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </ExitControl>
        <div
          className="relative h-4 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label={testOut ? "Test-out progress" : "Lesson progress"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="relative h-full rounded-full bg-brand transition-[width] duration-500 ease-[var(--ease-spring)]"
            style={{ width: `${Math.max(progress * 100, 4)}%` }}
          >
            {/* highlight along the top of the fill */}
            <span aria-hidden className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/35" />
          </div>
        </div>
        {onTip && (
          <button
            type="button"
            onClick={onTip}
            aria-haspopup="dialog"
            className="min-h-11 shrink-0 rounded-xl border-2 border-brand/30 bg-brand-light px-3 py-1 text-sm font-black text-brand-dark transition hover:brightness-95"
          >
            Tip
          </button>
        )}
        <Combo n={combo} />
        <Hearts hearts={hearts} />
      </div>
    </header>
  );
}

/** "3 in a row" counter: appears from 3 right answers in a row and pops on each new one. */
function Combo({ n }: { n: number }) {
  const hot = n >= COMBO_EVERY;
  return (
    <span className="flex min-w-0 shrink-0 justify-end" aria-live="polite">
      <AnimatePresence initial={false}>
        {n >= 3 && (
          <motion.span
            key="combo"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-black whitespace-nowrap ${
              hot ? "bg-sun text-white" : "bg-sun-light text-sun-dark"
            }`}
          >
            <motion.span
              key={n}
              initial={{ scale: 1.5, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 14 }}
              className="tabular-nums"
            >
              {n}
            </motion.span>
            {/* Hidden visually on the narrowest phones, still read out. */}
            <span className="max-[379px]:sr-only">in a row</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Heart counter: thumps and drops a ghost heart each time one is lost. */
function Hearts({ hearts }: { hearts: number }) {
  const [prev, setPrev] = useState(hearts);
  const [lost, setLost] = useState(0); // bumps on every loss, used as an animation key
  if (hearts !== prev) {
    // Adjust state during render (React's recommended pattern; no effect needed).
    setPrev(hearts);
    if (hearts < prev) setLost((n) => n + 1);
  }
  return (
    <div
      className={`relative flex shrink-0 items-center gap-1 font-black ${hearts <= 1 ? "text-accent-dark" : "text-accent"}`}
      role="img"
      aria-label={`${hearts} of ${MAX_HEARTS} hearts left`}
    >
      <span key={lost} className={`relative inline-flex ${lost ? "animate-heart" : ""}`}>
        <HeartIcon />
        {lost > 0 && (
          <span aria-hidden className="heart-ghost pointer-events-none absolute inset-0 text-accent">
            <HeartIcon broken />
          </span>
        )}
      </span>
      <span aria-hidden className="min-w-[1ch] text-lg text-accent-dark tabular-nums">{hearts}</span>
    </div>
  );
}

function Intro({ lesson, onStart }: { lesson: Lesson; onStart: () => void }) {
  const scriptTrack = useIsScriptLesson(lesson.id);
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-xl items-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-1 py-1 font-extrabold text-muted transition-colors hover:text-ink">
          <span aria-hidden>←</span> Back to the map
        </Link>
      </header>
      <main className="animate-rise mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pt-6 pb-36">
        <h1 className="text-3xl leading-tight font-black text-balance">{lesson.title}</h1>
        {lesson.status === "draft" && (
          <p className="-mt-3 rounded-2xl bg-sun-light px-4 py-3 text-sm font-semibold text-sun-dark">
            Early version: a native speaker is still checking this lesson, so a
            word or two may change.
          </p>
        )}
        {lesson.tip && (
          <div className="rounded-[var(--radius-card)] border-2 border-brand/20 bg-brand-light p-4 text-base leading-relaxed font-semibold text-ink">
            <h2 className="mb-1 font-black text-brand-dark">Before you start</h2>
            <MiniMarkdown text={lesson.tip} />
          </div>
        )}
        {lesson.vocab.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-black">New words</h2>
            <ul className="card flex flex-col divide-y-2 divide-line overflow-hidden">
              {lesson.vocab.map((v) => (
                <li key={v.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <BnText text={v} letter={scriptTrack} />
                    <span className="max-w-[45%] text-right font-bold text-pretty">{v.en}</span>
                  </div>
                  {v.notes && (
                    <p className="mt-1.5 pl-11 text-sm font-semibold text-muted">{v.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-xl px-4 pt-4 pb-4">
          <button type="button" autoFocus className="btn btn-primary w-full" onClick={onStart}>
            Start lesson
          </button>
        </div>
      </footer>
    </div>
  );
}

function OutOfHearts({
  onRetry,
  exitHref,
  onExit,
}: {
  onRetry: () => void;
  exitHref: string;
  onExit?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 bg-surface px-4 text-center">
      <div className="animate-medal flex h-32 w-32 items-center justify-center rounded-full bg-accent-light text-accent">
        <HeartIcon size={72} broken />
      </div>
      <div className="animate-rise">
        <h1 className="text-3xl font-black">Out of hearts</h1>
        <p className="mx-auto mt-1 max-w-sm font-semibold text-pretty text-muted">
          Mistakes are how this sticks. Have another go: the words will feel
          familiar now.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button type="button" autoFocus className="btn btn-primary w-full" onClick={onRetry}>
          Try again
        </button>
        <ExitControl exitHref={exitHref} onExit={onExit} className="btn btn-ghost w-full">
          Back
        </ExitControl>
      </div>
    </main>
  );
}
