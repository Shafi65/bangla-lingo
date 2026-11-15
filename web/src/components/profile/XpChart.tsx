"use client";

import { useState, type KeyboardEvent } from "react";
import { longDate, niceTicks, shortDate, type DayXp } from "@/lib/profile";
import { ChartCard, DataTable, Tip, useWidth } from "./chartKit";

const H = 168; // plot height
const AXIS_B = 24; // x-axis band
const AXIS_L = 30; // y-axis band
const TOP = 10;

/** XP per day, last 30 days: one column per day, the daily goal as a reference line. */
export function XpChart({ series, goal }: { series: DayXp[]; goal: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const total = series.reduce((n, d) => n + d.xp, 0);
  const daysOn = series.filter((d) => d.xp > 0).length;
  const peak = series.reduce((a, d) => (d.xp > a.xp ? d : a), series[0]);
  const ticks = niceTicks(Math.max(peak?.xp ?? 0, goal));
  const max = ticks[ticks.length - 1];

  const plotW = Math.max(0, width - AXIS_L);
  const band = series.length ? plotW / series.length : 0;
  const barW = Math.min(24, Math.max(3, band - 2)); // 2px surface gap between bars
  const y = (v: number) => TOP + H - (v / max) * H;
  const x = (i: number) => AXIS_L + i * band + (band - barW) / 2;

  function onKey(e: KeyboardEvent) {
    const last = series.length - 1;
    const cur = active ?? last;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") next = Math.min(last, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") setActive(null);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  const a = active !== null ? series[active] : undefined;
  const r = 4;

  return (
    <ChartCard
      id="xp-h"
      title="XP per day"
      note={`Last 30 days: ${total.toLocaleString("en-US")} XP on ${daysOn} ${daysOn === 1 ? "day" : "days"}`}
      table={<DataTable head={["Day", "XP"]} rows={[...series].reverse().map((d) => [longDate(d.date), d.xp])} />}
    >
      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
        <span className="h-0.5 w-4 rounded-full bg-sun" aria-hidden />
        Daily goal ({goal} XP)
      </p>
      <div ref={ref} className="relative" style={{ minHeight: TOP + H + AXIS_B }} onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={TOP + H + AXIS_B}
            role="img"
            tabIndex={0}
            aria-label={`Column chart of XP per day for the last 30 days. Total ${total} XP; best day ${peak.xp} XP on ${longDate(peak.date)}. Use the left and right arrow keys to read each day.`}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block overflow-visible"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={AXIS_L} x2={width} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                <text x={AXIS_L - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] font-bold tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {series.map((d, i) => {
              const h = (d.xp / max) * H;
              const x0 = x(i);
              const y0 = TOP + H - h;
              const rr = Math.min(r, h, barW / 2);
              return (
                <g key={d.date}>
                  {d.xp > 0 && (
                    <path
                      d={`M${x0} ${TOP + H}V${y0 + rr}Q${x0} ${y0} ${x0 + rr} ${y0}H${x0 + barW - rr}Q${x0 + barW} ${y0} ${x0 + barW} ${y0 + rr}V${TOP + H}Z`}
                      fill="var(--viz-bar)"
                      opacity={active === null || active === i ? 1 : 0.45}
                    />
                  )}
                  <rect
                    x={AXIS_L + i * band}
                    y={TOP}
                    width={band}
                    height={H}
                    fill="transparent"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                  />
                </g>
              );
            })}
            {/* daily goal reference */}
            <line x1={AXIS_L} x2={width} y1={y(goal)} y2={y(goal)} stroke="var(--color-sun)" strokeWidth={1.5} />
            <line x1={AXIS_L} x2={width} y1={TOP + H} y2={TOP + H} className="stroke-line-strong" strokeWidth={1} />
            {series.map((d, i) =>
              i % 7 === (series.length - 1) % 7 ? (
                <text
                  key={d.date}
                  x={x(i) + barW / 2}
                  y={TOP + H + 16}
                  textAnchor="middle"
                  className="fill-muted text-[11px] font-bold"
                >
                  {i === series.length - 1 ? "Today" : shortDate(d.date)}
                </text>
              ) : null,
            )}
            {active !== null && (
              <line
                x1={x(active) + barW / 2}
                x2={x(active) + barW / 2}
                y1={TOP}
                y2={TOP + H}
                className="stroke-line-strong"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
          </svg>
        )}
        {a && active !== null && (
          <Tip
            x={x(active) + barW / 2}
            y={Math.max(0, y(a.xp) - 58)}
            width={width}
            value={`${a.xp} XP`}
            label={longDate(a.date)}
          />
        )}
        <p className="sr-only" aria-live="polite">
          {a ? `${longDate(a.date)}: ${a.xp} XP` : ""}
        </p>
      </div>
    </ChartCard>
  );
}
