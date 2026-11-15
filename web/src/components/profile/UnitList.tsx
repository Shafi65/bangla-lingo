"use client";

import { useState } from "react";
import type { UnitProgress } from "@/lib/profile";
import { ChartCard } from "./chartKit";

/** Lessons completed in each unit, as meters. Untouched units past the next one fold away. */
export function UnitList({ units }: { units: UnitProgress[] }) {
  const [all, setAll] = useState(false);
  const lastStarted = units.reduce((i, u, k) => (u.done > 0 ? k : i), -1);
  // Started units, plus one more of each track so the next step is visible.
  const visible = all
    ? units
    : units.filter((u, k) => u.done > 0 || k <= lastStarted + 1 || k === units.findIndex((x) => x.track === u.track && x.done === 0));
  const finished = units.filter((u) => u.total > 0 && u.done === u.total).length;
  const hidden = units.length - visible.length;

  return (
    <ChartCard id="units-h" title="Progress by unit" note={`${finished} of ${units.length} units finished`}>
      <ul className="flex flex-col gap-3.5">
        {visible.map((u) => {
          const done = u.total > 0 && u.done === u.total;
          return (
            <li key={u.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 leading-tight">
                  <span className="text-xs font-extrabold text-muted">{u.label}</span>{" "}
                  <span className="font-extrabold text-ink">{u.title}</span>
                </p>
                <p className="shrink-0 text-sm font-bold text-muted tabular-nums">
                  {done ? "Done" : `${u.done} / ${u.total}`}
                </p>
              </div>
              <div
                className={`mt-1.5 h-2 overflow-hidden rounded-full ${u.track === "script" ? "bg-accent-light" : "bg-brand-light"}`}
                role="progressbar"
                aria-label={`${u.label}: ${u.title}`}
                aria-valuemin={0}
                aria-valuemax={u.total}
                aria-valuenow={u.done}
                aria-valuetext={`${u.done} of ${u.total} lessons`}
              >
                <div
                  className={`h-full rounded-full ${u.track === "script" ? "bg-accent" : "bg-brand"}`}
                  style={{ width: `${u.total ? (u.done / u.total) * 100 : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || all) && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-4 rounded-lg text-sm font-extrabold text-brand-dark underline-offset-4 hover:underline"
        >
          {all ? "Show fewer units" : `Show all ${units.length} units`}
        </button>
      )}
    </ChartCard>
  );
}
