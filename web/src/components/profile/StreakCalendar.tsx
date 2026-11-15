"use client";

import { useState, type KeyboardEvent } from "react";
import { longDate, type CalendarDay, type HeatLevel } from "@/lib/profile";
import { ChartCard, DataTable, Tip } from "./chartKit";

const CELL = 18;
const GAP = 4;
const STEP = CELL + GAP;
const LEFT = 30;
const TOP = 18;
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FILL: Record<HeatLevel, string> = {
  0: "var(--color-sunk)",
  1: "var(--viz-1)",
  2: "var(--viz-2)",
  3: "var(--viz-3)",
  4: "var(--viz-4)",
};

/** A month name over the first week that starts in it, skipped when it would crowd the previous one. */
function monthLabels(weeks: CalendarDay[][]): { w: number; label: string }[] {
  const out: { w: number; label: string }[] = [];
  weeks.forEach((col, w) => {
    const month = col[0].date.slice(5, 7);
    const prev = w > 0 ? weeks[w - 1][0].date.slice(5, 7) : "";
    if (month === prev) return;
    const last = out[out.length - 1];
    if (last && w - last.w < 2) return;
    if (w === 0 && weeks[1] && weeks[1][0].date.slice(5, 7) !== month) return; // a lone first week
    out.push({ w, label: MONTHS[Number(month) - 1] });
  });
  return out;
}

function levelText(level: HeatLevel, goal: number): string {
  return [
    "No practice",
    `Under ${Math.ceil(goal / 2)} XP`,
    `Under the ${goal} XP goal`,
    "Daily goal met",
    "Double the goal",
  ][level];
}

/** Twelve-week heatmap of daily activity, shaded against the daily goal. */
export function StreakCalendar({ weeks, goal, streak, best }: { weeks: CalendarDay[][]; goal: number; streak: number; best: number }) {
  const days = weeks.flat();
  let todayIdx = days.length - 1;
  while (todayIdx > 0 && days[todayIdx].future) todayIdx--;
  const [active, setActive] = useState<number | null>(null);
  const width = LEFT + weeks.length * STEP - GAP;
  const height = TOP + 7 * STEP - GAP;
  const activeCount = days.filter((d) => d.active).length;
  const pastCount = todayIdx + 1;

  function onKey(e: KeyboardEvent) {
    const cur = active ?? todayIdx;
    const move: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (e.key in move) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(todayIdx, cur + move[e.key])));
    } else if (e.key === "Escape") setActive(null);
  }

  const a = active !== null ? days[active] : undefined;
  const ax = active !== null ? LEFT + Math.floor(active / 7) * STEP : 0;
  const ay = active !== null ? TOP + (active % 7) * STEP : 0;

  return (
    <ChartCard
      id="cal-h"
      title="Streak calendar"
      note={`Active on ${activeCount} of the last ${pastCount} days. Current streak ${streak}, best ${best}.`}
      table={
        <DataTable
          head={["Day", "XP", "Level"]}
          rows={days
            .slice(0, todayIdx + 1)
            .filter((d) => d.active)
            .reverse()
            .map((d) => [longDate(d.date), d.xp, levelText(d.level, goal)])}
        />
      }
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="relative" onPointerLeave={() => setActive(null)}>
          <svg
            width={width}
            height={height}
            role="img"
            tabIndex={0}
            aria-label={`Calendar of the last ${weeks.length} weeks: active on ${activeCount} days. Use the arrow keys to read each day.`}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block"
          >
            {DAY_LABELS.map((l, i) =>
              l ? (
                <text key={i} x={0} y={TOP + i * STEP + 13} className="fill-muted text-[11px] font-bold">
                  {l}
                </text>
              ) : null,
            )}
            {monthLabels(weeks).map(({ w, label }) => (
              <text key={w} x={LEFT + w * STEP} y={11} className="fill-muted text-[11px] font-bold">
                {label}
              </text>
            ))}
            {days.map((d, i) => {
              if (d.future) return null;
              const cx = LEFT + Math.floor(i / 7) * STEP;
              const cy = TOP + (i % 7) * STEP;
              return (
                <rect
                  key={d.date}
                  x={cx}
                  y={cy}
                  width={CELL}
                  height={CELL}
                  rx={4}
                  fill={FILL[d.level]}
                  stroke={i === todayIdx ? "var(--color-ink)" : active === i ? "var(--color-muted)" : "none"}
                  strokeWidth={i === todayIdx || active === i ? 2 : 0}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                />
              );
            })}
          </svg>
          {a && <Tip x={ax + CELL / 2} y={ay - 54} width={width} value={a.xp ? `${a.xp} XP` : a.active ? "Practised" : "No practice"} label={longDate(a.date)} />}
          <p className="sr-only" aria-live="polite">
            {a ? `${longDate(a.date)}: ${a.xp} XP, ${levelText(a.level, goal)}` : ""}
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 text-xs font-bold text-muted" aria-label="Legend">
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <li key={l} className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: FILL[l] }} aria-hidden />
              {levelText(l, goal)}
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
