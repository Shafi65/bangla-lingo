"use client";

import Link from "next/link";
import type { CourseSummary, Track, UnitSummary } from "@/lib/types";
import {
  currentStreak,
  lessonStates,
  useProgress,
  type LessonState,
} from "@/lib/progress";
import { BoltIcon, FlameIcon } from "./icons";
import { Logo } from "./Logo";

const TRACKS: { track: Track; title: string; blurb: string }[] = [
  { track: "main", title: "Learn", blurb: "Words, phrases and grammar" },
  { track: "script", title: "Script", blurb: "Read the Bengali alphabet (বর্ণমালা)" },
];

// Zig-zag offsets for the lesson path (in px)
const OFFSETS = [0, 44, 64, 44, 0, -44, -64, -44];

export function CourseMap({ course }: { course: CourseSummary }) {
  const progress = useProgress();
  const streak = currentStreak(progress);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xl font-black tracking-tight text-brand">
              BanglaLingo
            </span>
          </div>
          <div className="flex items-center gap-4 text-base font-extrabold">
            <span className="flex items-center gap-1 text-sun" title="Day streak">
              <FlameIcon />
              <span>{streak}</span>
            </span>
            <span className="flex items-center gap-1 text-brand" title="Total XP">
              <BoltIcon />
              <span>{progress.xp} XP</span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-24">
        {course.source === "fixture" && (
          <p className="mb-6 rounded-2xl border-2 border-dashed border-sun bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Showing the built-in demo lesson. Real course content will appear
            here once <code>content/course.json</code> is published.
          </p>
        )}

        {TRACKS.map(({ track, title, blurb }) => {
          const units = course.units.filter((u) => u.track === track);
          if (units.length === 0) return null;
          return (
            <section key={track} className="mb-12" aria-labelledby={`track-${track}`}>
              <div className="mb-4">
                <h2 id={`track-${track}`} className="text-2xl font-black text-ink">
                  {title}
                </h2>
                <p className="text-sm font-semibold text-muted">{blurb}</p>
              </div>
              {units.map((unit, i) => (
                <UnitBlock
                  key={unit.id}
                  unit={unit}
                  index={i}
                  states={lessonStates(unit, progress)}
                  tone={track === "script" ? "accent" : "brand"}
                />
              ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}

function UnitBlock({
  unit,
  index,
  states,
  tone,
}: {
  unit: UnitSummary;
  index: number;
  states: LessonState[];
  tone: "brand" | "accent";
}) {
  if (unit.lessons.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border-2 border-dashed border-line p-4 text-muted">
        <div className="text-xs font-extrabold tracking-widest uppercase">
          Unit {index + 1} · Coming soon
        </div>
        <h3 className="text-lg font-black">{unit.title}</h3>
        {unit.description && <p className="text-sm font-semibold">{unit.description}</p>}
      </div>
    );
  }
  const done = states.filter((s) => s === "completed").length;
  const banner =
    tone === "brand"
      ? "bg-brand border-brand-dark"
      : "bg-accent border-accent-dark";
  // The next lesson to take = first unlocked, non-completed lesson
  const nextIdx = states.findIndex((s) => s === "unlocked");

  return (
    <div className="mb-10">
      <div className={`${banner} rounded-2xl border-b-4 p-4 text-white`}>
        <div className="text-xs font-extrabold tracking-widest uppercase opacity-80">
          Unit {index + 1} · {done}/{unit.lessons.length}
        </div>
        <h3 className="text-xl font-black">{unit.title}</h3>
        {unit.description && (
          <p className="text-sm font-semibold opacity-90">{unit.description}</p>
        )}
      </div>

      <ol className="mt-6 flex flex-col items-center gap-5">
        {unit.lessons.map((lesson, i) => (
          <li
            key={lesson.id}
            className="flex flex-col items-center"
            style={{ transform: `translateX(${OFFSETS[i % OFFSETS.length]}px)` }}
          >
            <LessonNode
              id={lesson.id}
              title={lesson.title}
              state={states[i]}
              isNext={i === nextIdx}
              tone={tone}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LessonNode({
  id,
  title,
  state,
  isNext,
  tone,
}: {
  id: string;
  title: string;
  state: LessonState;
  isNext: boolean;
  tone: "brand" | "accent";
}) {
  const base =
    "relative flex h-20 w-20 items-center justify-center rounded-full border-b-[6px] text-white transition";
  const colors =
    state === "locked"
      ? "bg-line border-gray-300 text-muted"
      : state === "completed"
        ? "bg-sun border-amber-600"
        : tone === "brand"
          ? "bg-brand border-brand-dark"
          : "bg-accent border-accent-dark";

  const icon =
    state === "locked" ? <LockIcon /> : state === "completed" ? <CheckIcon /> : <StarIcon />;

  const label = (
    <span
      className={`mt-2 max-w-36 text-center text-sm font-bold ${
        state === "locked" ? "text-muted" : "text-ink"
      }`}
    >
      {title}
    </span>
  );

  if (state === "locked") {
    return (
      <>
        <span className={`${base} ${colors}`} aria-label={`${title} (locked)`} role="img">
          {icon}
        </span>
        {label}
      </>
    );
  }

  return (
    <>
      <Link
        href={`/lesson/${id}`}
        aria-label={`${title}${state === "completed" ? " (completed, practice again)" : ""}`}
        className={`${base} ${colors} hover:brightness-110 active:translate-y-1 active:border-b-2 ${
          isNext ? "ring-4 ring-offset-4 ring-brand/30" : ""
        }`}
      >
        {isNext && (
          <span className="absolute -top-9 rounded-xl border-2 border-line bg-white px-3 py-1 text-xs font-black tracking-wide text-brand uppercase shadow-sm">
            Start
          </span>
        )}
        {icon}
      </Link>
      {label}
    </>
  );
}

function StarIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="currentColor" />
      <path d="M8 10V7.5a4 4 0 018 0V10" stroke="currentColor" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
