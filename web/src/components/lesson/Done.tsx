"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { BoltIcon, CoinIcon, FlameIcon, FreezeIcon, StarIcon } from "@/components/icons";
import { CountUp } from "@/components/motion/CountUp";
import { ProgressRing } from "@/components/motion/ProgressRing";
import { celebrate, originOf } from "@/lib/celebrate";
import { FREEZE_EVERY, questDef } from "@/lib/game/engine";
import { lessonStars } from "@/lib/progress";
import { playSfx } from "@/lib/sfx";

export interface DoneSummary {
  xp: number;
  accuracy: number;
  goal: number;
  xpToday: number;
  goalJustMet: boolean;
  streak: number;
  streakGrew: boolean;
  /** Taka coins earned in this run (absent for older callers). */
  coins?: number;
  /** Daily quests this run completed. */
  questsDone?: string[];
  /** A free streak freeze was given for reaching a streak milestone. */
  freeFreeze?: boolean;
  /** Longest run of right answers in a row. */
  bestCombo?: number;
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

const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.35 + i * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
});

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
  const coins = summary.coins ?? 0;
  const quests = (summary.questsDone ?? []).map(questDef).filter((q) => !!q);
  const pct = Math.round(accuracy * 100);
  const stars = lessonStars({ bestAccuracy: accuracy, completedAt: "", timesCompleted: 1 });
  const toGo = Math.max(goal - xpToday, 0);
  const milestone = streakGrew && streak > 1 && (streak % FREEZE_EVERY === 0 || streak === 3 || streak % 30 === 0);
  const medal = useRef<HTMLDivElement>(null);

  // Confetti: a small burst for every finish, a big one for a perfect run, a met goal or a streak milestone.
  useEffect(() => {
    const kind = milestone ? "streak" : pct === 100 || goalJustMet ? "big" : "small";
    const t = window.setTimeout(() => celebrate(kind, originOf(medal.current)), 250);
    const c = coins > 0 ? window.setTimeout(() => playSfx("coin"), 1100) : 0;
    return () => {
      window.clearTimeout(t);
      if (c) window.clearTimeout(c);
    };
    // Once per finished run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let row = 0;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-7 bg-surface px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <Burst />
        {/* Medal: a marigold disc with a running-stitch ring, like a kantha roundel. */}
        <div
          ref={medal}
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

      <dl className="grid w-full max-w-sm grid-cols-3 gap-3">
        <Stat label="XP earned" i={0}>
          <span className="flex items-center gap-1 text-sun-dark">
            <BoltIcon /> <CountUp to={xp} delay={0.4} />
          </span>
        </Stat>
        <Stat label="Accuracy" i={1}>
          <ProgressRing value={accuracy} size={52} stroke={6} tone={pct === 100 ? "sun" : "brand"} delay={0.55} label={`${pct}% right first time`}>
            <span className={`text-sm font-black ${pct === 100 ? "text-sun-dark" : "text-brand-dark"}`}>{pct}%</span>
          </ProgressRing>
        </Stat>
        <Stat label="Stars" i={2}>
          <span className="flex gap-0.5" role="img" aria-label={`${stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className={i < stars ? "text-sun" : "text-line-strong"}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.8 + i * 0.15, type: "spring", stiffness: 420, damping: 14 }}
              >
                <StarIcon size={20} />
              </motion.span>
            ))}
          </span>
        </Stat>
      </dl>

      <ul className="flex w-full max-w-sm flex-col gap-2 text-left font-bold">
        {coins > 0 && (
          <motion.li {...rise(row++)} className="flex items-center gap-3 rounded-2xl bg-sun-light px-4 py-3 text-sun-dark">
            <CoinIcon />
            <span>
              +<CountUp to={coins} delay={1} duration={0.6} /> taka coins
              {(summary.bestCombo ?? 0) >= 5 && <span className="font-semibold"> · best run {summary.bestCombo} in a row</span>}
            </span>
          </motion.li>
        )}
        <motion.li {...rise(row++)} className="flex items-center gap-3 rounded-2xl bg-brand-light px-4 py-3 text-brand-dark">
          <span aria-hidden className="text-xl">{goalJustMet || toGo === 0 ? "✓" : "◔"}</span>
          {goalJustMet
            ? `Daily goal reached: ${xpToday} XP today`
            : toGo === 0
              ? `${xpToday} XP today, goal already met`
              : `${toGo} XP to today's goal of ${goal}`}
        </motion.li>
        <motion.li {...rise(row++)} className="flex items-center gap-3 rounded-2xl bg-sun-light px-4 py-3 text-sun-dark">
          <motion.span
            className="text-sun"
            animate={streakGrew ? { scale: [1, 1.45, 1], rotate: [0, -8, 0] } : undefined}
            transition={{ delay: 0.9, duration: 0.6 }}
          >
            <FlameIcon />
          </motion.span>
          {streakGrew
            ? streak === 1
              ? "Streak started: come back tomorrow for day 2"
              : `${streak}-day streak, up from ${streak - 1}`
            : `${streak}-day streak, safe for today`}
        </motion.li>
        {summary.freeFreeze && (
          <motion.li {...rise(row++)} className="flex items-center gap-3 rounded-2xl bg-brand-light px-4 py-3 text-brand-dark">
            <FreezeIcon />
            {streak} days in a row: you earned a free streak freeze
          </motion.li>
        )}
        {quests.map((q) => (
          <motion.li key={q.id} {...rise(row++)} className="flex items-center gap-3 rounded-2xl border-2 border-brand/25 px-4 py-3 text-brand-dark">
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-sm text-white">✓</span>
            Quest done: {q.title}
          </motion.li>
        ))}
      </ul>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {onExit ? (
          <motion.button type="button" autoFocus className="btn btn-primary w-full" onClick={onExit} whileTap={{ scale: 0.97 }}>
            Continue
          </motion.button>
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

function Stat({ label, children, i }: { label: string; children: ReactNode; i: number }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-1 rounded-[var(--radius-card)] border-2 border-line bg-surface px-2 py-3"
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 380, damping: 24 }}
    >
      <dt className="text-xs font-extrabold text-muted">{label}</dt>
      <dd className="flex min-h-[52px] items-center text-2xl font-black tabular-nums">{children}</dd>
    </motion.div>
  );
}
