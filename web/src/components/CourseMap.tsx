"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
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
const ROW = 108;
const NODE = 72;
const STITCH_W = 240;

interface NumberedUnit {
  unit: UnitSummary;
  /** "Unit 3" / "Script 2": main and script units are numbered separately. */
  label: string;
}

interface Section {
  n: number;
  units: NumberedUnit[];
}

/** Review lessons are titled "Review: …" in content (the only loaded marker). */
export function isReviewLesson(l: Pick<LessonSummary, "title">): boolean {
  return /^review\b/i.test(l.title.trim());
}

/**
 * Sections group the course into stages: the main units up to and including
 * the next script unit (the script track is woven between main units).
 */
function sectionsOf(course: CourseSummary): Section[] {
  let mainN = 0;
  let scriptN = 0;
  const out: Section[] = [];
  let cur: NumberedUnit[] = [];
  for (const unit of course.units) {
    cur.push({ unit, label: unit.track === "script" ? `Script ${++scriptN}` : `Unit ${++mainN}` });
    if (unit.track === "script") {
      out.push({ n: out.length + 1, units: cur });
      cur = [];
    }
  }
  if (cur.length) out.push({ n: out.length + 1, units: cur });
  return out;
}

export function CourseMap({ course }: { course: CourseSummary }) {
  const progress = useProgress();
  const nextId = nextLessonId(course, progress);
  const next = findLesson(course, nextId);
  const anyDone = Object.keys(progress.completed).length > 0;
  const sections = sectionsOf(course);
  const currentSection =
    sections.find((s) => s.units.some((u) => u.unit.lessons.some((l) => l.id === nextId)))?.n ?? 1;
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({});

  useScrollToCurrent(nextId, anyDone);

  return (
    <AppShell aside={<Aside anyDone={anyDone} />}>
      <h1 className="sr-only">{course.title}</h1>
      {course.source === "fixture" && (
        <p className="mb-6 rounded-2xl border-2 border-dashed border-sun bg-sun-light p-3 text-sm font-semibold text-sun-dark">
          Showing the built-in demo lesson. Real course content will appear
          here once <code>content/course.json</code> is published.
        </p>
      )}

      <StreakNudge progress={progress} />

      {next ? (
        <ContinueCard lesson={next.lesson} unit={next.unit} progress={progress} anyDone={anyDone} />
      ) : (
        <AllDone />
      )}

      <ol aria-label="Course sections" className="mt-10 flex flex-col gap-12">
        {sections.map((s) => (
          <li key={s.n}>
            <SectionBlock
              section={s}
              progress={progress}
              nextId={nextId}
              open={openOverride[s.n] ?? s.n === currentSection}
              onToggle={(open) => setOpenOverride((o) => ({ ...o, [s.n]: open }))}
            />
          </li>
        ))}
      </ol>
    </AppShell>
  );
}

/** Once progress is known, bring the up-next lesson into view if it is off-screen. */
function useScrollToCurrent(nextId: string | undefined, anyDone: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !anyDone || !nextId) return;
    done.current = true;
    const el = document.getElementById(`lesson-${nextId}`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 80 && r.bottom <= window.innerHeight - 96) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Let the first paint settle so the motion reads as "here you are".
    const t = window.setTimeout(
      () => el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }),
      250,
    );
    return () => window.clearTimeout(t);
  }, [nextId, anyDone]);
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

function ContinueCard({
  lesson,
  unit,
  progress,
  anyDone,
}: {
  lesson: LessonSummary;
  unit: UnitSummary;
  progress: ProgressState;
  anyDone: boolean;
}) {
  const script = unit.track === "script";
  const review = isReviewLesson(lesson);
  const done = unit.lessons.filter((l) => progress.completed[l.id]).length;
  const idx = unit.lessons.findIndex((l) => l.id === lesson.id);

  return (
    <section
      aria-labelledby="continue-title"
      className="card overflow-hidden"
      style={{ boxShadow: "var(--shadow-lift)" }}
    >
      <div className="flex items-center gap-4 p-5 pb-4">
        <NodeFace lesson={lesson} state="unlocked" script={script} review={review} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-muted">
            {anyDone ? "Pick up where you left off" : "Start here"}
          </p>
          <h2 id="continue-title" className="text-2xl leading-tight font-black text-balance text-ink">
            {lesson.title}
          </h2>
          <p className={`mt-0.5 text-sm font-extrabold ${script ? "text-accent-dark" : "text-brand-dark"}`}>
            {unit.title}, lesson {idx + 1} of {unit.lessons.length}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t-2 border-line bg-sunk/60 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3" aria-hidden>
          <Bar value={done / unit.lessons.length} tone={script ? "accent" : "brand"} />
          <span className="shrink-0 text-sm font-bold text-muted">
            {done}/{unit.lessons.length}
          </span>
        </div>
        <Link href={`/lesson/${lesson.id}`} className="btn btn-primary w-full sm:w-auto">
          {anyDone ? "Continue" : "Start the first lesson"}
        </Link>
      </div>
    </section>
  );
}

function AllDone() {
  return (
    <section className="card p-6 text-center" style={{ boxShadow: "var(--shadow-lift)" }}>
      <p lang="bn" className="text-3xl font-bold text-brand-dark">শাবাশ!</p>
      <h2 className="mt-1 text-2xl font-black">Every lesson is done</h2>
      <p className="mt-1 font-semibold text-muted">
        New units are on the way. Mixed practice keeps the words fresh until then.
      </p>
      <Link href="/practice" className="btn btn-primary mt-4">
        <RepeatIcon /> Practice
      </Link>
    </section>
  );
}

function Bar({ value, tone, onBrand = false }: { value: number; tone: "brand" | "accent"; onBrand?: boolean }) {
  const track = onBrand ? "bg-white/25" : tone === "accent" ? "bg-accent-light" : "bg-brand-light";
  const fill = onBrand ? "bg-[#fff]" : tone === "accent" ? "bg-accent" : "bg-brand";
  return (
    <span className={`block h-2.5 w-full overflow-hidden rounded-full ${track}`}>
      <span
        className={`block h-full rounded-full transition-[width] duration-700 ease-out ${fill}`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
  );
}

function Aside({ anyDone }: { anyDone: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5">
        <h2 className="mb-3 text-lg font-black">Today</h2>
        <GoalRing size={84} stroke={9} showLabel />
        <Link href="/settings#goal" className="mt-3 inline-block rounded text-sm font-bold text-brand-dark underline-offset-2 hover:underline">
          Change daily goal
        </Link>
      </section>
      <section className="card p-5">
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

function SectionBlock({
  section,
  progress,
  nextId,
  open,
  onToggle,
}: {
  section: Section;
  progress: ProgressState;
  nextId: string | undefined;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const bodyId = useId();
  const lessons = section.units.flatMap((u) => u.unit.lessons);
  const done = lessons.filter((l) => progress.completed[l.id]).length;
  const total = lessons.length;

  return (
    <section aria-labelledby={`${bodyId}-h`}>
      <div className="flex items-end justify-between gap-4 border-b-2 border-line pb-3">
        <div className="min-w-0">
          <h2 id={`${bodyId}-h`} className="text-sm font-extrabold text-muted">
            Section {section.n}
          </h2>
          <p className="text-lg leading-snug font-black text-ink">
            {section.units.map((u) => u.unit.title).join(", ")}
          </p>
          <p className="text-sm font-bold text-muted">
            {done === total && total > 0 ? "Complete" : `${done} of ${total} lessons done`}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(!open)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold text-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          {open ? "Hide" : "Show"}
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div id={bodyId}>
        {open ? (
          <ol className="mt-6 flex flex-col gap-12">
            {section.units.map(({ unit, label }) => (
              <li key={unit.id}>
                {unit.lessons.length === 0 ? (
                  <ComingSoon unit={unit} label={label} />
                ) : (
                  <UnitBlock unit={unit} label={label} progress={progress} nextId={nextId} />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {section.units.map(({ unit, label }) => {
              const d = unit.lessons.filter((l) => progress.completed[l.id]).length;
              const script = unit.track === "script";
              return (
                <li key={unit.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(true)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-sunk"
                  >
                    <span className={`w-16 shrink-0 text-sm font-extrabold ${script ? "text-accent-dark" : "text-brand-dark"}`}>
                      {label}
                    </span>
                    <span className="min-w-0 flex-1 font-extrabold text-ink">{unit.title}</span>
                    <span className="flex w-24 shrink-0 items-center gap-2 text-xs font-bold text-muted">
                      <Bar value={unit.lessons.length ? d / unit.lessons.length : 0} tone={script ? "accent" : "brand"} />
                      {d}/{unit.lessons.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ComingSoon({ unit, label }: { unit: UnitSummary; label: string }) {
  const script = unit.track === "script";
  return (
    <div className="rounded-[var(--radius-panel)] border-2 border-dashed border-line-strong bg-surface/60 p-5">
      <p className={`text-sm font-extrabold ${script ? "text-accent-dark" : "text-brand-dark"}`}>
        {label}, coming soon
      </p>
      <h3 className="text-xl font-black text-ink">{unit.title}</h3>
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
                className={`stitch ${lit ? (script ? "stroke-accent" : "stroke-brand") : "stroke-line-strong"}`}
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

  // A cloth patch with a running-stitch edge: green for the main course,
  // undyed cloth with red thread for the script track.
  return (
    <header
      className={`kantha-edge flex items-center gap-4 rounded-[var(--radius-panel)] p-6 ${
        script ? "border-2 border-accent/30 bg-surface" : "bg-brand text-white"
      }`}
      style={
        {
          "--stitch": script ? "color-mix(in oklab, var(--color-accent) 45%, transparent)" : "rgb(255 255 255 / 0.38)",
        } as CSSProperties
      }
    >
      <div className="min-w-0 flex-1">
        <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-extrabold ${script ? "text-accent-dark" : "text-white/85"}`}>
          <span>{label}</span>
          {draft && <DraftChip onBrand={!script} />}
        </p>
        <h3 id={`unit-${unit.id}`} className={`text-2xl leading-tight font-black text-balance ${script ? "text-ink" : ""}`}>
          {unit.title}
        </h3>
        {unit.description && (
          <p className={`mt-0.5 font-semibold ${script ? "text-muted" : "text-white/90"}`}>{unit.description}</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Bar value={total ? done / total : 0} tone={script ? "accent" : "brand"} onBrand={!script} />
          <span className={`shrink-0 text-sm font-extrabold ${script ? "text-muted" : "text-white/90"}`}>
            {done === total ? "Done" : `${done} of ${total}`}
          </span>
        </div>
      </div>
      {glyph && (
        <span
          lang="bn"
          aria-hidden
          className="bn-display flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent-light text-5xl font-bold text-accent-dark"
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
      className={`chip ${onBrand ? "bg-white/20 text-white" : "bg-sun-light text-sun-dark"}`}
    >
      Early version
    </span>
  );
}

/** The visual of a lesson node (shared by the map and the continue card). */
function NodeFace({
  lesson,
  state,
  script,
  review,
  size = NODE,
  isNext = false,
}: {
  lesson: LessonSummary;
  state: LessonState;
  script: boolean;
  review: boolean;
  size?: number;
  isNext?: boolean;
}) {
  const shape = script && !review ? "rounded-[1.35rem]" : "rounded-full";
  let colors: string;
  let lip: string;
  if (state === "locked") {
    colors = "border-2 border-line-strong bg-sunk text-muted";
    lip = "var(--color-line-strong)";
  } else if (review) {
    colors = state === "completed" ? "bg-sun text-white" : "border-2 border-sun bg-sun-light text-sun-dark";
    lip = state === "completed" ? "var(--color-sun-edge)" : "var(--color-sun)";
  } else if (state === "completed") {
    colors = script ? "bg-accent text-white" : "bg-brand text-white";
    lip = script ? "var(--color-accent-edge)" : "var(--color-brand-edge)";
  } else {
    colors = script ? "border-2 border-accent bg-surface text-accent-dark" : "border-2 border-brand bg-surface text-brand-dark";
    lip = script ? "var(--color-accent)" : "var(--color-brand)";
  }

  const icon =
    state === "locked" ? (
      <LockIcon size={size * 0.36} />
    ) : state === "completed" && !review ? (
      <CheckIcon size={size * 0.46} />
    ) : review ? (
      <span className="[&_svg]:h-[1.9rem] [&_svg]:w-[1.9rem]"><RepeatIcon /></span>
    ) : script && lesson.glyph ? (
      <span lang="bn" className="bn-display font-bold" style={{ fontSize: size * 0.42 }}>
        {lesson.glyph}
      </span>
    ) : (
      <StarIcon size={size * 0.44} />
    );

  return (
    <span
      className={`press relative flex shrink-0 items-center justify-center ${state === "locked" ? "pointer-events-none" : ""} ${shape} ${colors} ${isNext ? "animate-beckon" : ""} ${
        review && state !== "locked" ? "kantha-edge" : ""
      }`}
      style={
        {
          width: size,
          height: size,
          "--lip": lip,
          "--lip-h": "6px",
          "--stitch": state === "completed" ? "rgb(255 255 255 / 0.55)" : "color-mix(in oklab, var(--color-sun-dark) 45%, transparent)",
          "--radius-panel": "9999px",
        } as CSSProperties
      }
    >
      {icon}
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
  const gap = NODE / 2 + 16;
  const review = isReviewLesson(lesson);

  const a11y = `${lesson.title}${review ? " (review)" : ""}, ${
    state === "locked"
      ? "locked: finish the previous lesson first"
      : state === "completed"
        ? `completed, ${stars} of 3 stars. Practise again`
        : isNext
          ? "up next"
          : "ready to start"
  }`;

  const pos = {
    top: 16,
    left: `calc(50% + ${offset - NODE / 2}px)`,
  } as const;
  const face = <NodeFace lesson={lesson} state={state} script={script} review={review} isNext={isNext} />;

  return (
    <li className="relative" style={{ height: ROW }}>
      {state === "locked" ? (
        <span id={`lesson-${lesson.id}`} className="absolute" style={pos} role="img" aria-label={a11y}>
          {face}
        </span>
      ) : (
        <Link
          id={`lesson-${lesson.id}`}
          href={`/lesson/${lesson.id}`}
          aria-label={a11y}
          className="group absolute scroll-my-40 rounded-full hover:brightness-105 [&:active>span]:translate-y-[6px] [&:active>span]:shadow-none"
          style={pos}
        >
          {face}
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
        {isNext && <span className="chip mb-1 bg-brand text-white">Up next</span>}
        {review && !isNext && <span className="chip mb-1 bg-sun-light text-sun-dark">Review</span>}
        <span className={`text-base leading-tight font-extrabold text-balance ${state === "locked" ? "text-muted" : "text-ink"}`}>
          {review ? lesson.title.replace(/^review\s*:?\s*/i, "") || lesson.title : lesson.title}
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
        <span key={i} className={i < n ? "text-sun" : "text-line-strong"}>
          <StarIcon size={16} />
        </span>
      ))}
    </span>
  );
}
