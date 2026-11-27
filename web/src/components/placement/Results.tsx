"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { BANDS, type Band, type Group, type Placement, type PlacementConfig, type PlacementUnit } from "@/lib/placement/types";
import { bandIndex, unitBands } from "@/lib/placement/engine";
import { Knot, VStitch } from "./Thread";

const GROUP_NAMES: Record<Group, string> = { listening: "Listening", reading: "Reading", grammar: "Grammar" };

export function Results({
  headingRef,
  placement,
  config,
  units,
  firstLessonId,
  onAccept,
  onDecline,
  onRetake,
  busy,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  placement: Placement;
  config: PlacementConfig;
  units: PlacementUnit[];
  firstLessonId: string;
  onAccept: () => void;
  onDecline: () => void;
  onRetake: () => void;
  busy: boolean;
}) {
  const p = placement;
  const bands = unitBands(units, config);
  const done = new Set(p.completeLessonIds);
  const startBand = bands.get(p.startUnitId) ?? "A1";
  // A band is "done" when every lesson of its units is marked done.
  const stations = BANDS.map((b) => {
    const us = units.filter((u) => bands.get(u.id) === b && u.lessons.length);
    const state: "done" | "here" | "todo" =
      b === startBand ? "here" : us.length > 0 && us.every((u) => u.lessons.every((l) => done.has(l))) ? "done" : "todo";
    return { band: b, label: config.bands.find((x) => x.id === b)?.label ?? b, state, empty: us.length === 0 };
  }).filter((s) => !s.empty);
  const atStart = p.route === "start" || p.route === "alphabet";
  const headline = p.route === "alphabet" || p.route === "fast-lane" ? "Start with the alphabet" : `Start at ${p.startLabel}`;
  const short = /^Intermediate: /.test(p.startLabel) ? p.startLabel : p.startLabel.split(":")[0];

  return (
    <div className="animate-rise flex flex-1 flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-[2rem] leading-[1.12] font-black text-balance outline-none">
          {headline}
        </h1>
        <p className="text-lg font-semibold text-pretty text-muted">{p.explanation}</p>
      </div>

      <ol aria-label="Where you are in the course" className="flex flex-col rounded-[var(--radius-panel)] bg-surface p-5 shadow-[var(--shadow-lift)]">
        {stations.map((s, i) => (
          <li key={s.band} className="grid grid-cols-[18px_1fr] gap-x-4" aria-current={s.state === "here" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span className="mt-1">
                <Knot state={s.state} />
              </span>
              {i < stations.length - 1 && <VStitch sewn={s.state === "done"} className="flex-1" />}
            </div>
            <div className={`flex items-baseline justify-between gap-3 ${i < stations.length - 1 ? "pb-4" : ""}`}>
              <span className={`text-lg ${s.state === "here" ? "font-black text-ink" : "font-bold text-muted"}`}>{s.label}</span>
              <span className={`text-sm font-extrabold ${s.state === "here" ? "text-sun-dark" : "text-muted"}`}>
                {s.state === "here" ? "You start here" : s.state === "done" ? "Marked done" : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="skills-h" className="flex flex-col gap-4">
        <h2 id="skills-h" className="text-xl font-black">
          How each skill went
        </h2>
        {p.groups.map((g) => (
          <SkillBar key={g.group} name={GROUP_NAMES[g.group]} correct={g.correct} total={g.total} level={g.level} config={config} />
        ))}
      </section>

      {p.notes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-sun-light px-4 py-3 font-semibold text-sun-dark" role="note">
          {p.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <button type="button" className="btn btn-primary w-full" onClick={onAccept} disabled={busy}>
          {p.route === "alphabet" || p.route === "fast-lane" ? "Start with the alphabet" : `Start at ${short}`}
        </button>
        {!atStart && (
          <Link
            href={`/lesson/${encodeURIComponent(firstLessonId)}`}
            onClick={onDecline}
            className="self-center rounded-lg px-2 py-1 text-center font-extrabold text-brand-dark underline underline-offset-4"
          >
            Start from the beginning instead
          </Link>
        )}
        <button type="button" onClick={onRetake} className="self-center rounded-lg px-2 py-1 text-sm font-extrabold text-muted hover:text-ink">
          Take the test again
        </button>
      </div>
    </div>
  );
}

function SkillBar({
  name,
  correct,
  total,
  level,
  config,
}: {
  name: string;
  correct: number;
  total: number;
  level: Band | null;
  config: PlacementConfig;
}) {
  const share = total ? correct / total : 0;
  const levelText = total === 0 ? "Not tested" : level ? `Solid up to ${config.bands.find((b) => b.id === level)?.label}` : "Still building";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-black">{name}</span>
        <span className="text-sm font-bold text-muted">
          {total ? `${correct} of ${total} right` : "No questions"}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-sunk" aria-hidden>
        <div
          className={`h-full rounded-full ${bandIndex(level) >= 1 ? "bg-brand" : "bg-sun"}`}
          style={{ width: `${Math.max(total ? 4 : 0, Math.round(share * 100))}%` }}
        />
      </div>
      <span className="text-sm font-bold text-muted">{levelText}</span>
    </div>
  );
}
