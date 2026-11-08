"use client";

import Link from "next/link";
import type { CourseSummary, LessonSummary, UnitSummary } from "@/lib/types";
import {
  currentStreak,
  lessonStars,
  lessonStates,
  nextLessonId,
  streakStatus,
  useProgress,
  type LessonRecord,
  type LessonState,
  type ProgressState,
} from "@/lib/progress";
import { AppShell } from "./AppShell";
import { CheckIcon, LockIcon, RepeatIcon, StarIcon } from "./icons";
import { GoalRing } from "./Stats";

// Zig-zag offsets for the lesson path (px from centre) and row geometry.
const OFFSETS = [0, 52, 76, 52, 0, -52, -76, -52];
const ROW = 104;
const NODE = 72;
const STITCH_W = 240;

interface NumberedUnit {
  unit: UnitSummary;
  /** "Unit 3" / "Script 2": main and script units are numbered separately. */
  label: string;
}

export function CourseMap({ course }: { course: CourseSummary }) {
  const progress = useProgress();
  const nextId = nextLessonId(course, progress);
  const next = findLesson(course, nextId);
  const anyDone = Object.keys(progress.completed).length > 0;

  let mainN = 0;
  let scriptN = 0;
  const numbered: NumberedUnit[] = course.units.map((unit) => ({
    unit,
    label: unit.track === "script" ? `Script ${++scriptN}` : `Unit ${++mainN}`,
  }));
  // Show the first not-yet-available unit in full, fold the rest away.
  const firstSoon = numbered.findIndex((n) => n.unit.lessons.length === 0);
  const shown = firstSoon < 0 ? numbered : numbered.slice(0, firstSoon + 1);
  const later = firstSoon < 0 ? [] : numbered.slice(firstSoon + 1);

  return (
    <AppShell aside={<Aside anyDone={anyDone} />}>
      {course.source === "fixture" && (
        <p className="mb-6 rounded-2xl border-2 border-dashed border-sun bg-sun-light p-3 text-sm font-semibold text-sun-dark">
          Showing the built-in demo lesson. Real course content will appear
          here once <code>content/course.json</code> is published.
        </p>
      )}

      <StreakNudge progress={progress} />

      {next && <UpNext lesson={next.lesson} unit={next.unit} anyDone={anyDone} />}

      <ol aria-label="Course path" className="mt-8 flex flex-col gap-10">
        {shown.map(({ unit, label }) => (
          <li key={unit.id}>
            {unit.lessons.length === 0 ? (
              <ComingSoon unit={unit} label={label} />
            ) : (
              <UnitBlock unit={unit} label={label} progress={progress} nextId={nextId} />
            )}
          </li>
        ))}
      </ol>

      {later.length > 0 && (
        <details className="group mt-6 rounded-2xl border-2 border-dashed border-line bg-white/60 p-4">
          <summary className="cursor-pointer list-none rounded-lg font-extrabold text-muted marker:hidden">
            <span className="inline-block transition group-open:rotate-90" aria-hidden>›</span>{" "}
            {later.length} more units on the way
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {later.map(({ unit, label }) => (
              <li key={unit.id} className="flex gap-3 text-sm">
                <span className={`w-16 shrink-0 font-extrabold ${unit.track === "script" ? "text-accent-dark" : "text-brand-dark"}`}>
                  {label}
                </span>
                <span>
                  <span className="font-extrabold text-ink">{unit.title}</span>
                  {unit.description && <span className="block font-semibold text-muted">{unit.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AppShell>
  );
}

function findLesson(course: CourseSummary, id: string | undefined) {
  if (!id) return undefined;
  for (const unit of course.units) {
    const lesson = unit.lessons.find((l) => l.id === id);
    if (lesson) return { unit, lesson };
  }
  return undefined;
}

function StreakNudge({ progress }: { progress: ProgressState }) {
  if (streakStatus(progress) !== "at-risk") return null;
  const n = currentStreak(progress);
  return (
    <p className="mb-4 rounded-2xl border-2 border-accent/30 bg-accent-light px-4 py-3 font-bold text-accent-dark" role="status">
      Your {n}-day streak ends at midnight. One lesson keeps it going.
    </p>
  );
}

function UpNext({ lesson, unit, anyDone }: { lesson: LessonSummary; unit: UnitSummary; anyDone: boolean }) {
  const script = unit.track === "script";
  return (
    <section
      aria-label="Up next"
      className="flex items-center gap-4 rounded-3xl border-2 border-b-4 border-line bg-white p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-muted">{anyDone ? "Pick up where you left off" : "Start here"}</p>
        <p className="truncate text-xl font-black text-ink">{lesson.title}</p>
        <p className={`text-sm font-bold ${script ? "text-accent-dark" : "text-brand-dark"}`}>{unit.title}</p>
      </div>
      <Link href={`/lesson/${lesson.id}`} className="btn btn-primary shrink-0">
        {anyDone ? "Continue" : "Start"}
      </Link>
    </section>
  );
}

function Aside({ anyDone }: { anyDone: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl border-2 border-line bg-white p-5">
        <h2 className="mb-3 text-lg font-black">Today</h2>
        <GoalRing size={84} stroke={9} showLabel />
        <Link href="/settings#goal" className="mt-3 inline-block rounded text-sm font-bold text-brand-dark underline-offset-2 hover:underline">
          Change daily goal
        </Link>
      </section>
      <section className="rounded-3xl border-2 border-line bg-white p-5">
        <h2 className="text-lg font-black">Practice</h2>
        <p className="mt-1 mb-4 text-sm font-semibold text-muted">
          {anyDone
            ? "A quick mixed review of lessons you have finished."
            : "Finish a lesson to unlock mixed review."}
        </p>
        {anyDone ? (
          <Link href="/practice" className="btn btn-ghost w-full">
            <RepeatIcon /> Practice
          </Link>
        ) : null}
      </section>
    </div>
  );
}

function ComingSoon({ unit, label }: { unit: UnitSummary; label: string }) {
  const script = unit.track === "script";
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-white/60 p-5">
      <p className={`text-sm font-extrabold ${script ? "text-accent-dark" : "text-brand-dark"}`}>
        {label}, coming soon
      </p>
      <h2 className="text-xl font-black text-ink">{unit.title}</h2>
      {unit.description && <p className="font-semibold text-muted">{unit.description}</p>}
    </div>
  );
}

function UnitBlock({
  unit,
  label,
  progress,
  nextId,
}: {
  unit: UnitSummary;
  label: string;
  progress: ProgressState;
  nextId: string | undefined;
}) {
  const states = lessonStates(unit, progress);
  const done = states.filter((s) => s === "completed").length;
  const script = unit.track === "script";
  const draft = unit.lessons.some((l) => l.draft);
  const n = unit.lessons.length;

  return (
    <section aria-labelledby={`unit-${unit.id}`}>
      <UnitHeader unit={unit} label={label} done={done} draft={draft} />

      <div className="relative mt-4" style={{ height: n * ROW }}>
        <svg
          aria-hidden
          className="absolute top-0 left-1/2 -translate-x-1/2"
          width={STITCH_W}
          height={n * ROW}
        >
          {unit.lessons.slice(0, -1).map((l, i) => {
            const x1 = STITCH_W / 2 + OFFSETS[i % OFFSETS.length];
            const x2 = STITCH_W / 2 + OFFSETS[(i + 1) % OFFSETS.length];
            const y1 = i * ROW + 16 + NODE / 2;
            const y2 = (i + 1) * ROW + 16 + NODE / 2;
            const lit = states[i] === "completed";
            return (
              <path
                key={l.id}
                d={`M${x1} ${y1} C${x1} ${y1 + ROW / 2} ${x2} ${y2 - ROW / 2} ${x2} ${y2}`}
                className={`stitch ${lit ? (script ? "stroke-accent" : "stroke-brand") : "stroke-gray-300"}`}
              />
            );
          })}
        </svg>
        <ol aria-label={`${unit.title} lessons`}>
          {unit.lessons.map((lesson, i) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={i}
              state={states[i]}
              record={progress.completed[lesson.id]}
              isNext={lesson.id === nextId}
              script={script}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function UnitHeader({
  unit,
  label,
  done,
  draft,
}: {
  unit: UnitSummary;
  label: string;
  done: number;
  draft: boolean;
}) {
  const script = unit.track === "script";
  const total = unit.lessons.length;
  const glyph = script ? unit.lessons.find((l) => l.glyph)?.glyph : undefined;

  return (
    <header
      className={
        script
          ? "flex items-center gap-4 rounded-3xl border-2 border-b-4 border-accent/40 bg-white p-5"
          : "rounded-3xl border-b-4 border-brand-dark bg-brand p-5 text-white"
      }
    >
      <div className="min-w-0 flex-1">
        <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-extrabold ${script ? "text-accent-dark" : "text-white/85"}`}>
          <span>{label}</span>
          <span className={script ? "text-muted" : "text-white/85"}>
            {done} of {total} done
          </span>
          {draft && <DraftChip onBrand={!script} />}
        </p>
        <h2 id={`unit-${unit.id}`} className={`text-2xl font-black ${script ? "text-ink" : ""}`}>
          {unit.title}
        </h2>
        {unit.description && (
          <p className={`font-semibold ${script ? "text-muted" : "text-white/90"}`}>{unit.description}</p>
        )}
        <div
          className={`mt-3 h-2 overflow-hidden rounded-full ${script ? "bg-accent-light" : "bg-white/25"}`}
          aria-hidden
        >
          <div
            className={`h-full rounded-full ${script ? "bg-accent" : "bg-white"}`}
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>
      {glyph && (
        <span
          lang="bn"
          aria-hidden
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent-light text-5xl font-bold text-accent-dark"
        >
          {glyph}
        </span>
      )}
    </header>
  );
}

/** Calm marker for content that has not had native-speaker review yet. */
export function DraftChip({ onBrand = false }: { onBrand?: boolean }) {
  return (
    <span
      title="These lessons are an early version and are being checked by a native speaker."
      className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
        onBrand ? "bg-white/20 text-white" : "bg-sun-light text-sun-dark"
      }`}
    >
      Early version
    </span>
  );
}

function LessonRow({
  lesson,
  index,
  state,
  record,
  isNext,
  script,
}: {
  lesson: LessonSummary;
  index: number;
  state: LessonState;
  record: LessonRecord | undefined;
  isNext: boolean;
  script: boolean;
}) {
  const offset = OFFSETS[index % OFFSETS.length];
  const labelLeft = offset > 0; // put the title on the roomier side
  const stars = lessonStars(record);
  const gap = NODE / 2 + 14;

  const shape = script ? "rounded-2xl" : "rounded-full";
  const colors =
    state === "locked"
      ? "border-gray-300 bg-line text-muted"
      : state === "completed"
        ? script
          ? "border-accent-dark bg-accent text-white"
          : "border-brand-dark bg-brand text-white"
        : script
          ? "border-accent bg-white text-accent-dark border-2 border-b-[6px]"
          : "border-brand bg-white text-brand-dark border-2 border-b-[6px]";

  const icon =
    state === "locked" ? (
      <LockIcon />
    ) : state === "completed" ? (
      <CheckIcon />
    ) : script && lesson.glyph ? (
      <span lang="bn" className="text-3xl font-bold">{lesson.glyph}</span>
    ) : (
      <StarIcon size={32} />
    );

  const a11y = `${lesson.title}, ${
    state === "locked"
      ? "locked: finish the previous lesson first"
      : state === "completed"
        ? `completed, ${stars} of 3 stars. Practise again`
        : isNext
          ? "up next"
          : "ready to start"
  }`;

  const nodeCls = `absolute flex items-center justify-center border-b-[6px] transition ${shape} ${colors} ${
    isNext ? "animate-beckon" : ""
  }`;
  const nodeStyle = {
    width: NODE,
    height: NODE,
    top: 16,
    left: `calc(50% + ${offset - NODE / 2}px)`,
  };

  return (
    <li className="relative" style={{ height: ROW }}>
      {state === "locked" ? (
        <span className={nodeCls} style={nodeStyle} role="img" aria-label={a11y}>
          {icon}
        </span>
      ) : (
        <Link
          href={`/lesson/${lesson.id}`}
          aria-label={a11y}
          className={`${nodeCls} hover:brightness-105 active:translate-y-1 active:border-b-2`}
          style={nodeStyle}
        >
          {icon}
        </Link>
      )}
      <div
        aria-hidden
        className={`absolute flex flex-col justify-center ${labelLeft ? "items-end text-right" : "items-start"}`}
        style={{
          top: 16,
          height: NODE,
          ...(labelLeft
            ? { left: 0, right: `calc(50% - ${offset}px + ${gap}px)` }
            : { right: 0, left: `calc(50% + ${offset}px + ${gap}px)` }),
        }}
      >
        {isNext && (
          <span className="mb-1 rounded-full bg-brand px-2.5 py-0.5 text-xs font-extrabold text-white">
            Up next
          </span>
        )}
        <span className={`text-base leading-tight font-extrabold ${state === "locked" ? "text-muted" : "text-ink"}`}>
          {lesson.title}
        </span>
        {state === "completed" && <Stars n={stars} />}
      </div>
    </li>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="mt-1 flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? "text-sun" : "text-line"}>
          <StarIcon size={16} />
        </span>
      ))}
    </span>
  );
}
