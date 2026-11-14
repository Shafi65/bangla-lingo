"use client";

import {
  currentStreak,
  streakStatus,
  todayXp,
  useProgress,
} from "@/lib/progress";
import { FlameIcon } from "./icons";

/** Ring showing today's XP toward the daily goal. */
export function GoalRing({
  size = 40,
  stroke = 5,
  showLabel = false,
}: {
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const p = useProgress();
  const goal = p.settings.dailyGoal;
  const xp = todayXp(p);
  const frac = Math.min(xp / goal, 1);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const met = xp >= goal;
  const label = `${xp} of ${goal} XP today${met ? ": daily goal reached" : ""}`;

  return (
    <div className="flex items-center gap-2" role="img" aria-label={label} title={label}>
      <span className="relative inline-flex" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-line"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={`transition-[stroke-dashoffset] duration-700 ${met ? "stroke-sun" : "stroke-brand"}`}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-black ${
            size >= 80 ? "text-2xl" : "text-xs"
          } ${met ? "text-sun-dark" : "text-brand-dark"}`}
          aria-hidden
        >
          {met && size < 80 ? "✓" : xp}
        </span>
      </span>
      {showLabel && (
        <span className="text-sm leading-tight font-bold text-muted" aria-hidden>
          <span className="block text-base font-black text-ink">
            {met ? "Goal reached" : `${goal - xp} XP to go`}
          </span>
          {xp} / {goal} XP today
        </span>
      )}
    </div>
  );
}

/** Flame + day count. Hollow with a red dot when the streak is at risk today. */
export function StreakBadge() {
  const p = useProgress();
  const n = currentStreak(p);
  const status = streakStatus(p);
  const label =
    status === "done"
      ? `${n}-day streak, done for today`
      : status === "at-risk"
        ? `${n}-day streak: practice today to keep it`
        : "No streak yet: finish a lesson to start one";
  const tone =
    status === "done" ? "text-sun-dark" : status === "at-risk" ? "text-accent-dark" : "text-muted";

  return (
    <span className={`relative flex items-center gap-1 font-black ${tone}`} role="img" aria-label={label} title={label}>
      <span className={status === "done" ? "text-sun" : status === "at-risk" ? "text-accent" : "text-line"}>
        <FlameIcon hollow={status === "at-risk"} />
      </span>
      <span aria-hidden>{n}</span>
      {status === "at-risk" && (
        <span aria-hidden className="absolute -top-0.5 left-4 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
      )}
    </span>
  );
}
