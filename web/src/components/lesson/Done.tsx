"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BoltIcon, FlameIcon, StarIcon } from "@/components/icons";
import { lessonStars } from "@/lib/progress";

export interface DoneSummary {
  xp: number;
  accuracy: number;
  goal: number;
  xpToday: number;
  goalJustMet: boolean;
  streak: number;
  streakGrew: boolean;
}

const PETAL_COLORS = ["#006a4e", "#f42a41", "#ffb300", "#2f9e78"];

/** Petals flung outward from the medal; positions are deterministic. */
function Burst() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.12;
        const dist = 90 + (i % 4) * 22;
        const style = {
          background: PETAL_COLORS[i % PETAL_COLORS.length],
          "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
          "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
          "--rot": `${(i % 2 ? 1 : -1) * (120 + i * 17)}deg`,
          "--delay": `${120 + (i % 5) * 30}ms`,
        } as CSSProperties;
        return <span key={i} className="petal" style={style} />;
      })}
    </span>
  );
}

export function Done({
  title,
  subtitle,
  summary,
  onRetry,
  onExit,
}: {
  title: string;
  subtitle: string;
  summary: DoneSummary;
  onRetry: () => void;
  onExit?: () => void;
}) {
  const { xp, accuracy, goal, xpToday, goalJustMet, streak, streakGrew } = summary;
  const pct = Math.round(accuracy * 100);
  const stars = lessonStars({ bestAccuracy: accuracy, completedAt: "", timesCompleted: 1 });
  const toGo = Math.max(goal - xpToday, 0);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-7 bg-surface px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <Burst />
        {/* Medal: a marigold disc with a running-stitch ring, like a kantha roundel. */}
        <div
          className="kantha-edge animate-medal flex h-32 w-32 items-center justify-center rounded-full bg-sun text-white"
          style={
            {
              boxShadow: "0 6px 0 var(--color-sun-edge)",
              "--stitch": "rgb(255 255 255 / 0.6)",
              "--radius-panel": "9999px",
            } as CSSProperties
          }
        >
          <StarIcon size={68} />
        </div>
      </div>

      <div className="animate-rise">
        <h1 className="text-3xl font-black text-brand-dark">{title}</h1>
        <p className="mt-1 text-lg font-extrabold text-ink">{subtitle}</p>
        <p className="mt-1 font-semibold text-muted">
          <span lang="bn" className="font-bold text-ink">শাবাশ!</span> (shabash: well done!)
        </p>
      </div>

      <dl className="stagger grid w-full max-w-sm grid-cols-3 gap-3">
        <Stat label="XP earned">
          <span className="flex items-center gap-1 text-sun-dark">
            <BoltIcon /> {xp}
          </span>
        </Stat>
        <Stat label="Accuracy">
          <span className="text-brand-dark">{pct}%</span>
        </Stat>
        <Stat label="Stars">
          <span className="flex gap-0.5" role="img" aria-label={`${stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < stars ? "text-sun" : "text-line-strong"}>
                <StarIcon size={20} />
              </span>
            ))}
          </span>
        </Stat>
      </dl>

      <ul className="stagger flex w-full max-w-sm flex-col gap-2 text-left font-bold">
        <li className="flex items-center gap-3 rounded-2xl bg-brand-light px-4 py-3 text-brand-dark">
          <span aria-hidden className="text-xl">{goalJustMet || toGo === 0 ? "✓" : "◔"}</span>
          {goalJustMet
            ? `Daily goal reached: ${xpToday} XP today`
            : toGo === 0
              ? `${xpToday} XP today, goal already met`
              : `${toGo} XP to today's goal of ${goal}`}
        </li>
        <li className="flex items-center gap-3 rounded-2xl bg-sun-light px-4 py-3 text-sun-dark">
          <span className="text-sun"><FlameIcon /></span>
          {streakGrew
            ? streak === 1
              ? "Streak started: come back tomorrow for day 2"
              : `${streak}-day streak, up from ${streak - 1}`
            : `${streak}-day streak, safe for today`}
        </li>
      </ul>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {onExit ? (
          <button type="button" autoFocus className="btn btn-primary w-full" onClick={onExit}>
            Continue
          </button>
        ) : (
          <Link href="/" autoFocus className="btn btn-primary w-full">
            Continue
          </Link>
        )}
        <button type="button" className="btn btn-ghost w-full" onClick={onRetry}>
          Do it again
        </button>
      </div>
    </main>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--radius-card)] border-2 border-line bg-surface px-2 py-3">
      <dt className="text-xs font-extrabold text-muted">{label}</dt>
      <dd className="flex min-h-8 items-center text-2xl font-black tabular-nums">{children}</dd>
    </div>
  );
}
