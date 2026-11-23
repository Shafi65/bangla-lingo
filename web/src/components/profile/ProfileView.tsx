"use client";

import Link from "next/link";
import { useMemo } from "react";
import { localDateKey } from "@/lib/progress";
import { achievements, bnDigits, compact, profileStats, streakCalendar, xpSeries, type ProfileStats } from "@/lib/profile";
import type { WordIndex } from "@/lib/review/targets";
import type { ReviewWord } from "@/lib/review/types";
import type { CourseSummary } from "@/lib/types";
import { ProfileAccountSlot } from "../account/slots";
import { AppShell } from "../AppShell";
import { FlameIcon } from "../icons";
import { useReviewData } from "../review/useReviewData";
import { Achievements } from "./Achievements";
import { VIZ_VARS } from "./chartKit";
import { StreakCalendar } from "./StreakCalendar";
import { StrengthBar } from "./StrengthBar";
import { UnitList } from "./UnitList";
import { XpChart } from "./XpChart";

/**
 * Profile: totals, charts and achievements. Everything here derives from the
 * stored progress and word memory, so it renders only after mount (`now` is 0
 * during prerender and the first client render) and shows a skeleton until then.
 */
export function ProfileView({ words, index, course }: { words: ReviewWord[]; index: WordIndex; course: CourseSummary }) {
  const { progress, memory, now } = useReviewData(words, index);

  const view = useMemo(() => {
    if (!now) return null;
    const today = localDateKey(new Date(now));
    const stats = profileStats({ progress, memory, words, course, today, now });
    return {
      stats,
      badges: achievements(stats),
      series: xpSeries(progress, today, 30),
      weeks: streakCalendar(progress, today, 12),
    };
  }, [now, progress, memory, words, course]);

  return (
    <AppShell>
      <div className={VIZ_VARS}>
        <h1 className="text-3xl font-black">Your progress</h1>
        <ProfileAccountSlot />
        {!view ? (
          <Skeleton />
        ) : view.stats.isNew ? (
          <>
            <EmptyState />
            <Achievements list={view.badges} />
          </>
        ) : (
          <>
            <Header s={view.stats} />
            <Achievements list={view.badges} />
            <h2 className="mt-10 text-xl font-black">Activity</h2>
            <XpChart series={view.series} goal={progress.settings.dailyGoal} />
            <StreakCalendar weeks={view.weeks} goal={progress.settings.dailyGoal} streak={view.stats.streak} best={view.stats.bestStreak} />
            <h2 className="mt-10 text-xl font-black">Course</h2>
            <StrengthBar counts={view.stats.strength} />
            <UnitList units={view.stats.units} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Header({ s }: { s: ProfileStats }) {
  const tiles: { label: string; value: number; unit?: string }[] = [
    { label: "Best streak", value: s.bestStreak, unit: s.bestStreak === 1 ? "day" : "days" },
    { label: "Words learned", value: s.wordsLearned },
    { label: "Lessons done", value: s.lessonsCompleted },
    { label: "Days active", value: s.daysActive },
  ];
  return (
    <section
      aria-label="Totals"
      className="kantha-edge mt-5 overflow-hidden rounded-[var(--radius-panel)] bg-brand p-6 text-white [--stitch:rgb(255_255_255/0.35)] dark:bg-brand-light dark:[--stitch:rgb(116_212_174/0.35)]"
    >
      <div className="relative flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-extrabold text-white/80 dark:text-brand-dark">Total XP</p>
          <p className="text-6xl leading-none font-black tracking-tight dark:text-ink">{compact(s.xp)}</p>
          <p className="mt-1.5 text-sm font-bold text-white/75 dark:text-muted">
            <span lang="bn" className="font-bengali text-base">
              {bnDigits(compact(s.xp))}
            </span>{" "}
            in Bengali digits
          </p>
        </div>
        <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-white/12 px-4 py-2.5 dark:bg-surface/50">
          <span className={s.streak > 0 ? "text-sun" : "text-white/50 dark:text-line-strong"}>
            <FlameIcon size={30} />
          </span>
          <span className="text-2xl leading-none font-black dark:text-ink">{s.streak}</span>
          <span className="mt-0.5 text-xs font-extrabold text-white/80 dark:text-muted">day streak</span>
        </div>
      </div>
      <dl className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t-2 border-dashed border-white/25 pt-5 sm:grid-cols-4 dark:border-brand-dark/25">
        {tiles.map((t) => (
          <div key={t.label}>
            <dt className="text-xs font-extrabold text-white/80 dark:text-muted">{t.label}</dt>
            <dd className="text-2xl leading-tight font-black dark:text-ink">
              {compact(t.value)}
              {t.unit && <span className="ml-1 text-sm font-extrabold text-white/80 dark:text-muted">{t.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-5 rounded-[var(--radius-panel)] border-2 border-dashed border-line-strong bg-surface p-6 text-center">
      <p className="text-xl font-black">Nothing here yet</p>
      <p className="mx-auto mt-1 max-w-sm font-semibold text-muted">
        Finish a lesson to start your streak, earn XP and collect the first badge below.
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Start your first lesson
      </Link>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your progress" className="mt-5 flex flex-col gap-4">
      <div className="skeleton h-52 w-full rounded-[var(--radius-panel)]!" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton aspect-square w-full rounded-full!" />
        ))}
      </div>
      <div className="skeleton h-56 w-full" />
    </div>
  );
}
