"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MiniMarkdown } from "@/components/lesson/MiniMarkdown";
import { currentVerdict, itemStatus, lessonProgress, type Verdict } from "@/lib/reviewer/storage";
import { setOverall, setVerdict, useReviewState } from "@/lib/reviewer/store";
import type { KolkataMap, Target } from "@/lib/reviewer/targets";
import type { Lesson } from "@/lib/types";
import { Chip } from "./bits";
import { ExerciseBody, TYPE_LABEL } from "./ExerciseBody";
import { ReviewControls } from "./ReviewControls";
import { VocabTable } from "./VocabTable";

interface Props {
  lesson: Lesson;
  unitTitle: string;
  translit: Record<string, string>;
  kolkata: KolkataMap;
  targets: Target[];
  prev?: { id: string; title: string };
  next?: { id: string; title: string };
}

const CARD = "rounded-2xl border-2 border-line bg-surface p-3 sm:p-4";

/** Wraps an item: scroll anchor, "active" ring; click or focus makes it the target of the shortcuts. */
function Box({
  k,
  label,
  active,
  onActivate,
  children,
}: {
  k: string;
  label?: string;
  active: boolean;
  onActivate: (k: string) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={`t-${k}`}
      data-target={k}
      role={label ? "article" : undefined}
      aria-label={label}
      onClickCapture={() => onActivate(k)}
      onFocusCapture={() => onActivate(k)}
      className={`scroll-mt-16 transition-shadow ${active ? "rounded-2xl ring-4 ring-brand/40" : ""}`}
    >
      {children}
    </div>
  );
}

function isTyping(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable);
}

export function LessonReview({ lesson, unitTitle, translit, kolkata, targets, prev, next }: Props) {
  const state = useReviewState();
  const [active, setActive] = useState<string | null>(null);
  const [openRecycle, setOpenRecycle] = useState<Set<string>>(() => new Set());
  const byKey = useMemo(() => new Map(targets.map((t) => [t.key, t])), [targets]);
  const prog = lessonProgress(state, lesson.id, targets);
  const recycleIds = useMemo(() => lesson.exercises.filter((e) => e.recycle).map((e) => e.id), [lesson]);
  const entries = useMemo(() => state.lessons[lesson.id]?.items ?? {}, [state.lessons, lesson.id]);

  const goTo = useCallback((key: string) => {
    setActive(key);
    document.getElementById(`t-${key}`)?.scrollIntoView({ block: "center" });
  }, []);

  const toggleRecycle = useCallback((id: string) => {
    setOpenRecycle((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }, []);

  useEffect(() => {
    const keys = targets.map((t) => t.key);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const i = active ? keys.indexOf(active) : -1;
      const k = e.key.toLowerCase();
      if (k === "j") goTo(keys[Math.min(i + 1, keys.length - 1)]);
      else if (k === "k") goTo(keys[i < 0 ? keys.length - 1 : Math.max(i - 1, 0)]);
      else if (k === "u") {
        const order = [...keys.slice(i + 1), ...keys.slice(0, i + 1)];
        const hit = order.find((key) => currentVerdict(entries[key], byKey.get(key)!.hash) === undefined);
        if (hit) goTo(hit);
      } else if (k === "e" && active && recycleIds.includes(active)) toggleRecycle(active);
      else if ((k === "1" || k === "2" || k === "3") && active) {
        const v: Verdict = k === "1" ? "ok" : k === "2" ? "needs_change" : "unsure";
        setVerdict(lesson.id, byKey.get(active)!, v);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targets, active, entries, byKey, goTo, lesson.id, recycleIds, toggleRecycle]);

  const dot = (t: Target) => {
    const e = entries[t.key];
    const st = itemStatus(e, t.hash);
    const v = currentVerdict(e, t.hash);
    if (st === "changed") return "border-sun-edge bg-sun-light text-sun-dark border-dashed";
    if (v === "ok") return "border-brand bg-brand text-white";
    if (v === "needs_change") return "border-accent bg-accent text-white";
    if (v === "unsure") return "border-sun-edge bg-sun text-ink";
    return "border-line-strong bg-surface text-muted";
  };
  let exN = 0;
  let vN = 0;
  const pillLabel = (t: Target) => (t.kind === "tip" ? "Tip" : t.kind === "vocab" ? `V${++vN}` : `${++exN}`);

  const rating = state.lessons[lesson.id]?.overall?.rating;
  const overallComment = state.lessons[lesson.id]?.overall?.comment ?? "";
  const pct = prog.total ? Math.round((prog.reviewed / prog.total) * 100) : 0;
  const tip = byKey.get("tip");

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 sm:px-5">
      <div className="pt-3">
        <Link href="/reviewer" className="font-extrabold text-brand-dark underline">
          ‹ All lessons
        </Link>
      </div>
      <header className="mt-1">
        <p className="text-sm font-bold text-muted">
          {unitTitle} · <code className="font-mono">{lesson.id}</code>
        </p>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-pretty sm:text-3xl">
          {lesson.title}
          {lesson.status && <Chip tone={lesson.status === "draft" ? "warn" : "good"}>{lesson.status}</Chip>}
          {lesson.scriptOnly && <Chip>script-only display</Chip>}
        </h1>
        {lesson.reviewedBy && <p className="text-sm font-semibold text-muted">Reviewed by {lesson.reviewedBy}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
          <span aria-live="polite">
            {prog.reviewed} / {prog.total} reviewed
          </span>
          <span className="text-brand-dark">{prog.ok} OK</span>
          <span className="text-accent-dark">{prog.needsChange} need change</span>
          <span className="text-sun-dark">{prog.unsure} unsure</span>
          {prog.changed > 0 && <span className="text-sun-dark">{prog.changed} changed since review</span>}
          {recycleIds.length > 0 && (
            <button
              type="button"
              className="font-extrabold text-brand-dark underline"
              onClick={() => setOpenRecycle(openRecycle.size ? new Set() : new Set(recycleIds))}
            >
              {openRecycle.size ? "Collapse" : "Expand"} {recycleIds.length} recycle exercises
            </button>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-label="Lesson review progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 hidden text-sm font-semibold text-muted sm:block">
          Keys: <kbd className="rounded border border-line-strong px-1">J</kbd> next · <kbd className="rounded border border-line-strong px-1">K</kbd> previous ·{" "}
          <kbd className="rounded border border-line-strong px-1">U</kbd> next unreviewed · <kbd className="rounded border border-line-strong px-1">1</kbd> OK ·{" "}
          <kbd className="rounded border border-line-strong px-1">2</kbd> Needs change · <kbd className="rounded border border-line-strong px-1">3</kbd> Unsure · <kbd className="rounded border border-line-strong px-1">E</kbd> open/close a recycle exercise
        </p>
      </header>

      <nav aria-label="Jump to item" className="sticky top-0 z-10 -mx-3 mt-3 border-b-2 border-line bg-surface/95 px-3 py-1.5 backdrop-blur sm:-mx-5 sm:px-5">
        <ul className="flex gap-1 overflow-x-auto p-1">
          {targets.map((t) => (
            <li key={t.key} className="shrink-0">
              <button
                type="button"
                title={t.key}
                aria-label={`Go to ${t.key}`}
                aria-current={active === t.key ? "true" : undefined}
                onClick={() => goTo(t.key)}
                className={`min-h-7 min-w-7 rounded-lg border-2 px-1.5 text-xs font-extrabold ${dot(t)} ${active === t.key ? "outline-3 outline-offset-1 outline-focus" : ""}`}
              >
                {pillLabel(t)}
              </button>
            </li>
          ))}
          <li className="shrink-0">
            <a href="#overall" className="inline-flex min-h-7 items-center rounded-lg border-2 border-line-strong px-1.5 text-xs font-extrabold text-brand-dark">
              Overall
            </a>
          </li>
        </ul>
      </nav>

      {lesson.tip && tip && (
        <section className="mt-5" aria-labelledby="tip-h">
          <h2 id="tip-h" className="mb-2 text-lg font-black">
            Tip
          </h2>
          <Box k="tip" label="Lesson tip" active={active === "tip"} onActivate={setActive}>
            <div className={CARD}>
              <div className="rounded-xl bg-sun-light p-3 text-ink">
                <MiniMarkdown text={lesson.tip} />
              </div>
              <div className="mt-3">
                <ReviewControls lessonId={lesson.id} target={tip} />
              </div>
            </div>
          </Box>
        </section>
      )}

      {lesson.vocab.length > 0 && (
        <section className="mt-6" aria-labelledby="vocab-h">
          <h2 id="vocab-h" className="mb-2 text-lg font-black">
            Vocabulary ({lesson.vocab.length})
          </h2>
          <VocabTable
            lessonId={lesson.id}
            vocab={lesson.vocab}
            kolkata={kolkata}
            targets={byKey}
            wrap={(key, children) => (
              <Box key={key} k={key} active={active === key} onActivate={setActive}>
                {children}
              </Box>
            )}
          />
        </section>
      )}

      <section className="mt-6" aria-labelledby="ex-h">
        <h2 id="ex-h" className="mb-2 text-lg font-black">
          Exercises ({lesson.exercises.length})
        </h2>
        <div className="space-y-3">
          {lesson.exercises.map((ex, i) => {
            const t = byKey.get(ex.id)!;
            const collapsed = !!ex.recycle && !openRecycle.has(ex.id);
            return (
              <Box key={ex.id} k={ex.id} label={`Exercise ${ex.id}`} active={active === ex.id} onActivate={setActive}>
                <div className={`${CARD} ${ex.recycle ? "border-dashed" : ""}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-sunk px-2 py-0.5 text-sm font-black">
                      {i + 1}. <span className="font-mono">{ex.id}</span>
                    </span>
                    <Chip tone="info">{TYPE_LABEL[ex.type]}</Chip>
                    {ex.recycle && <Chip tone="warn">Recycle (auto-generated review)</Chip>}
                    {ex.recycle && (
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={() => toggleRecycle(ex.id)}
                        className="text-sm font-extrabold text-brand-dark underline"
                      >
                        {collapsed ? "Show" : "Hide"} details
                      </button>
                    )}
                  </div>
                  {!collapsed && <ExerciseBody ex={ex} translit={translit} />}
                  <div className={collapsed ? "" : "mt-3 border-t-2 border-line pt-3"}>
                    <ReviewControls lessonId={lesson.id} target={t} />
                  </div>
                </div>
              </Box>
            );
          })}
        </div>
      </section>

      <section id="overall" className="mt-8 scroll-mt-16" aria-labelledby="overall-h">
        <div className={CARD}>
          <h2 id="overall-h" className="text-lg font-black">
            Overall: does this lesson sound natural?
          </h2>
          <p className="text-sm font-semibold text-muted">1 = unnatural, 5 = completely natural. Tap the chosen number again to clear it.</p>
          <div role="radiogroup" aria-label="Overall naturalness, 1 to 5" className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} out of 5`}
                onClick={() => setOverall(lesson.id, { rating: rating === n ? undefined : n })}
                className={`h-11 w-11 rounded-xl border-2 text-lg font-black ${rating === n ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:bg-sunk"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={overallComment}
            onChange={(e) => setOverall(lesson.id, { comment: e.target.value })}
            aria-label="Overall comment on this lesson"
            placeholder="Overall comment (বাংলা is fine)"
            className="focus-border field-sizing-content mt-2 block min-h-20 w-full resize-y rounded-xl border-2 border-line-strong bg-surface px-3 py-1.5 text-base leading-relaxed placeholder:text-muted/80 focus:border-brand"
          />
        </div>
      </section>

      <nav aria-label="Other lessons" className="mt-6 flex flex-wrap justify-between gap-3">
        {prev ? (
          <Link href={`/reviewer/${prev.id}`} className="rounded-xl border-2 border-line-strong px-4 py-2 font-extrabold hover:bg-sunk">
            ‹ {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/reviewer/${next.id}`} className="rounded-xl border-2 border-line-strong px-4 py-2 font-extrabold hover:bg-sunk">
            {next.title} ›
          </Link>
        )}
      </nav>
    </div>
  );
}
