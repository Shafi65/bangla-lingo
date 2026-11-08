"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BnText } from "@/components/BnText";
import { BoltIcon } from "@/components/icons";
import { checkResponse, solutionFor, type Response } from "@/lib/answers";
import { progressStore } from "@/lib/progress";
import type { Exercise, Lesson } from "@/lib/types";
import { ListenSelect } from "./exercises/ListenSelect";
import { MatchPairs } from "./exercises/MatchPairs";
import { ScriptRecognize } from "./exercises/ScriptRecognize";
import { SelectTranslation } from "./exercises/SelectTranslation";
import { TypeTranslation } from "./exercises/TypeTranslation";
import { WordBank } from "./exercises/WordBank";
import type { ExerciseProps } from "./exercises/types";

export const MAX_HEARTS = 5;
const XP_COMPLETE = 10;
const XP_PER_FIRST_TRY = 1;

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  // Bumping `attempt` remounts the run with fresh state (retry after hearts run out).
  const [attempt, setAttempt] = useState(0);
  return (
    <LessonRun key={attempt} lesson={lesson} onRetry={() => setAttempt((a) => a + 1)} />
  );
}

type Phase = "intro" | "play" | "done" | "out";

function LessonRun({ lesson, onRetry }: { lesson: Lesson; onRetry: () => void }) {
  const total = lesson.exercises.length;
  const hasIntro = !!lesson.tip || lesson.vocab.length > 0;

  const [phase, setPhase] = useState<Phase>(hasIntro ? "intro" : "play");
  const [queue, setQueue] = useState<number[]>(() => lesson.exercises.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [response, setResponse] = useState<Response | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [missed, setMissed] = useState<Set<number>>(() => new Set());
  const [solved, setSolved] = useState(0);
  const [summary, setSummary] = useState<{ xp: number; accuracy: number } | null>(null);

  const exIndex = queue[pos];
  const ex = lesson.exercises[exIndex];

  const check = () => {
    if (!response || result !== null) return;
    const ok = checkResponse(ex, response);
    setResult(ok);
    if (ok) {
      setSolved((s) => s + 1);
    } else {
      setHearts((h) => h - 1);
      setMissed((m) => new Set(m).add(exIndex));
      setQueue((q) => [...q, exIndex]); // retry at the end, Duolingo-style
    }
  };

  const advance = () => {
    if (result === null) return;
    if (!result && hearts <= 0) {
      setPhase("out");
      return;
    }
    const next = pos + 1;
    if (next >= queue.length) {
      const firstTry = total - missed.size;
      const xp = XP_COMPLETE + firstTry * XP_PER_FIRST_TRY;
      const accuracy = total ? firstTry / total : 1;
      progressStore.completeLesson(lesson.id, xp, accuracy);
      setSummary({ xp, accuracy });
      setPhase("done");
      return;
    }
    setPos(next);
    setResponse(null);
    setResult(null);
  };

  if (phase === "intro") {
    return <Intro lesson={lesson} onStart={() => setPhase("play")} />;
  }
  if (phase === "done" && summary) {
    return <Done lesson={lesson} {...summary} />;
  }
  if (phase === "out") {
    return <OutOfHearts onRetry={onRetry} />;
  }

  const props: ExerciseProps<Exercise> = {
    ex,
    locked: result !== null,
    onChange: setResponse,
    onSubmit: () => (result === null ? check() : advance()),
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar hearts={hearts} progress={solved / total} />

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-48">
        {pos >= total && (
          <p className="mb-3 text-sm font-black tracking-wide text-accent uppercase">
            Previous mistake
          </p>
        )}
        {/* key: remount each queue slot so per-exercise state resets on retries */}
        <ExerciseView key={pos} {...props} />
      </main>

      <footer
        className={`fixed inset-x-0 bottom-0 border-t-2 ${
          result === null
            ? "border-line bg-white"
            : result
              ? "animate-slide-up border-transparent bg-brand-light"
              : "animate-slide-up border-transparent bg-accent-light"
        }`}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5">
          {result !== null && <Feedback ex={ex} correct={result} />}
          {result === null ? (
            <button type="button" className="btn btn-primary w-full" disabled={!response} onClick={check}>
              Check
            </button>
          ) : (
            <button
              type="button"
              autoFocus
              className={`btn w-full ${result ? "btn-primary" : "btn-danger"}`}
              onClick={advance}
            >
              Continue
            </button>
          )}
        </div>
      </footer>
    </div>
  );
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
  }
}

function TopBar({ hearts, progress }: { hearts: number; progress: number }) {
  return (
    <header className="mx-auto flex w-full max-w-xl items-center gap-4 px-4 pt-5">
      <Link
        href="/"
        aria-label="Quit lesson"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-gray-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </Link>
      <div
        className="h-4 flex-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>
      <div className="flex items-center gap-1 font-black text-accent" aria-label={`${hearts} hearts left`}>
        <HeartIcon />
        <span>{hearts}</span>
      </div>
    </header>
  );
}

function Feedback({ ex, correct }: { ex: Exercise; correct: boolean }) {
  const sol = solutionFor(ex);
  const tone = correct ? "text-brand-dark" : "text-accent-dark";
  return (
    <div className={`flex flex-col gap-2 ${tone}`} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-2xl font-black">
        {correct ? <CheckBadge /> : <CrossBadge />}
        {correct ? "Nicely done!" : "Not quite"}
      </div>
      {sol && (
        <div className="flex flex-col gap-1">
          {!correct && (
            <div className="text-sm font-black tracking-wide uppercase">Correct answer:</div>
          )}
          {"glyph" in sol ? (
            <div className="flex items-center gap-3">
              <span lang="bn" className="text-3xl font-bold text-ink">{sol.glyph}</span>
              <span className="text-lg font-bold text-ink">= {sol.sound}</span>
            </div>
          ) : (
            <>
              {!correct && sol.display !== sol.text.bn && (
                <div className="text-lg font-bold text-ink">{sol.display}</div>
              )}
              <BnText text={sol.text} showEn />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Intro({ lesson, onStart }: { lesson: Lesson; onStart: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center px-4 pt-5">
        <Link href="/" className="text-sm font-black tracking-wide text-muted uppercase hover:text-ink">
          ← Back
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pt-6 pb-32">
        <h1 className="text-3xl font-black">{lesson.title}</h1>
        {lesson.tip && (
          <div className="rounded-2xl border-2 border-brand/20 bg-brand-light p-4 text-base leading-relaxed font-semibold text-ink">
            <div className="mb-1 text-xs font-black tracking-widest text-brand uppercase">Tip</div>
            <MiniMarkdown text={lesson.tip} />
          </div>
        )}
        {lesson.vocab.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-black tracking-widest text-muted uppercase">
              New words
            </h2>
            <ul className="flex flex-col divide-y-2 divide-line rounded-2xl border-2 border-line">
              {lesson.vocab.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 p-3">
                  <BnText text={v} />
                  <span className="text-right font-bold">
                    {v.en}
                    {v.notes && <span className="block text-xs font-semibold text-muted">{v.notes}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-line bg-white">
        <div className="mx-auto max-w-xl px-4 py-5">
          <button type="button" autoFocus className="btn btn-primary w-full" onClick={onStart}>
            Start lesson
          </button>
        </div>
      </footer>
    </div>
  );
}

function Done({ lesson, xp, accuracy }: { lesson: Lesson; xp: number; accuracy: number }) {
  const pct = Math.round(accuracy * 100);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="animate-pop flex h-28 w-28 items-center justify-center rounded-full bg-sun text-white">
        <svg width="64" height="64" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
          />
        </svg>
      </div>
      <div>
        <h1 className="text-3xl font-black text-brand">Lesson complete!</h1>
        <p className="mt-1 font-semibold text-muted">
          {lesson.title} · <span lang="bn">শাবাশ!</span> (shabash, well done!)
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-4">
        <Stat label="XP earned" tone="sun" value={<><BoltIcon /> {xp}</>} />
        <Stat label="Accuracy" tone="brand" value={`${pct}%`} />
      </div>
      <Link href="/" className="btn btn-primary w-full max-w-sm">
        Continue
      </Link>
    </main>
  );
}

function OutOfHearts({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-accent">
        <HeartIcon size={88} broken />
      </div>
      <div>
        <h1 className="text-3xl font-black">Out of hearts</h1>
        <p className="mt-1 font-semibold text-muted">
          No worries: mistakes are how you learn. Give it another go.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button type="button" className="btn btn-primary w-full" onClick={onRetry}>
          Try again
        </button>
        <Link href="/" className="btn btn-ghost w-full">
          Back to map
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone: "sun" | "brand" }) {
  const c = tone === "sun" ? "border-sun bg-sun text-sun" : "border-brand bg-brand text-brand";
  return (
    <div className={`overflow-hidden rounded-2xl border-2 ${c}`}>
      <div className="py-1 text-xs font-black tracking-widest text-white uppercase">{label}</div>
      <div className="flex items-center justify-center gap-1 bg-white py-3 text-2xl font-black">
        {value}
      </div>
    </div>
  );
}

/** Tiny renderer for lesson tips: paragraphs + **bold**. */
function MiniMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n+/).map((para, i) => (
        <p key={i} className={i ? "mt-2" : ""}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <strong key={j} className="font-black text-brand-dark">
                {chunk.slice(2, -2)}
              </strong>
            ) : (
              chunk
            ),
          )}
        </p>
      ))}
    </>
  );
}

function HeartIcon({ size = 24, broken = false }: { size?: number; broken?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.2 4.5 7 4.5c2.1 0 3.6 1.1 5 2.8 1.4-1.7 2.9-2.8 5-2.8 3.8 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z"
      />
      {broken && (
        <path d="M12 7.3l-1.5 4 2.5 1.5-1.5 4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function CheckBadge() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}
function CrossBadge() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
