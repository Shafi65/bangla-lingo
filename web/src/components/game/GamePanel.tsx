"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { ChestIcon, CoinIcon, FlameIcon, FreezeIcon } from "@/components/icons";
import { celebrate, originOf } from "@/lib/celebrate";
import {
  boostActive,
  CHEST_COINS,
  chestReady,
  coinBalance,
  freezesHeld,
  GOAL_COINS,
  goalChoices,
  marketDays,
  MAX_FREEZES,
  questDef,
  questDone,
} from "@/lib/game/engine";
import { commitToStreak, dismissNotice, openChest, refreshQuests, useGame } from "@/lib/game/storage";
import { streakWeek, type DayMark } from "@/lib/game/streak";
import { currentStreak, localDateKey, useProgress } from "@/lib/progress";
import { useNow } from "@/lib/review";
import { playSfx } from "@/lib/sfx";

/** Today's quests and the chest they open. */
export function QuestCard({ className = "" }: { className?: string }) {
  const g = useGame();
  const hid = useId();
  const [opened, setOpened] = useState(0);
  const chest = useRef<HTMLButtonElement>(null);

  // Today's set is created on first view (the date is read only in the browser).
  useEffect(() => {
    refreshQuests();
  }, []);

  const day = g.today;
  if (!day) return null;
  const doneCount = day.quests.filter(questDone).length;
  const ready = chestReady(day);

  const claim = () => {
    const coins = openChest();
    if (!coins) return;
    setOpened(coins);
    playSfx("chest");
    celebrate("big", originOf(chest.current));
  };

  return (
    <section className={`card p-5 ${className}`} aria-labelledby={hid}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id={hid} className="text-lg font-black">
          Daily quests
        </h2>
        <span className="text-sm font-bold text-muted">
          {doneCount} of {day.quests.length}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {day.quests.map((q) => {
          const def = questDef(q.id);
          if (!def) return null;
          const done = questDone(q);
          return (
            <li key={q.id}>
              <Link href={def.href} className="group flex flex-col gap-1.5 rounded-xl">
                <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
                  <motion.span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] ${done ? "bg-brand text-white" : "border-2 border-line-strong"}`}
                    initial={false}
                    animate={done ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {done ? "✓" : ""}
                  </motion.span>
                  <span className={`flex-1 group-hover:underline ${done ? "text-muted line-through decoration-2" : ""}`}>{def.title}</span>
                  <span className="text-xs font-bold text-muted tabular-nums">
                    {q.progress}/{def.target}
                  </span>
                </span>
                <span
                  className="ml-7 h-2.5 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-label={def.title}
                  aria-valuemin={0}
                  aria-valuemax={def.target}
                  aria-valuenow={q.progress}
                >
                  <motion.span
                    className={`block h-full rounded-full ${done ? "bg-brand" : "bg-sun"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((q.progress / def.target) * 100, q.progress ? 6 : 0)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.15 }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <AnimatePresence mode="wait" initial={false}>
          {opened ? (
            <motion.p
              key="opened"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-sun-light px-4 py-3 font-black text-sun-dark"
              role="status"
            >
              <CoinIcon /> +{opened} taka coins
            </motion.p>
          ) : ready ? (
            <motion.button
              key="ready"
              ref={chest}
              type="button"
              onClick={claim}
              className="btn w-full bg-sun text-white"
              style={{ boxShadow: "0 4px 0 var(--color-sun-edge)" }}
              animate={{ rotate: [0, -3, 3, -2, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.6 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChestIcon size={24} /> Open the tiffin box (+{CHEST_COINS})
            </motion.button>
          ) : (
            <motion.p key="locked" className="flex items-center gap-2 text-sm font-bold text-muted">
              <span className="text-line-strong">
                <ChestIcon size={22} open={day.claimed} />
              </span>
              {day.claimed ? "Today's tiffin box is open. New quests tomorrow." : `Finish all three for a tiffin box of ${CHEST_COINS} coins.`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** Coin balance, held freezes and anything running from the shop. */
export function WalletCard({ className = "" }: { className?: string }) {
  const g = useGame();
  const hid = useId();
  const now = useNow();
  const balance = coinBalance(g);
  const held = freezesHeld(g);
  const boostMin = now && boostActive(g, now) ? Math.ceil((g.boostUntil - now) / 60_000) : 0;
  const market = marketDays(g);

  return (
    <section className={`card p-5 ${className}`} aria-labelledby={hid}>
      <h2 id={hid} className="sr-only">
        Coins and streak freezes
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" title="Taka coins">
          <CoinIcon size={30} />
          <span className="leading-tight">
            <motion.span key={balance} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="block text-2xl font-black tabular-nums text-sun-dark">
              {balance}
            </motion.span>
            <span className="text-xs font-bold text-muted">taka coins</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5" role="img" aria-label={`${held} of ${MAX_FREEZES} streak freezes`}>
          {Array.from({ length: MAX_FREEZES }, (_, i) => (
            <motion.span
              key={i}
              className={i < held ? "text-brand" : "text-line-strong"}
              initial={false}
              animate={i < held ? { scale: [0.6, 1.15, 1], opacity: 1 } : { scale: 1, opacity: 0.7 }}
            >
              <FreezeIcon size={28} />
            </motion.span>
          ))}
        </div>
      </div>
      {(boostMin > 0 || market > 0) && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm font-extrabold">
          {boostMin > 0 && <li className="chip bg-sun-light text-sun-dark">2× review XP · {boostMin} min left</li>}
          {market > 0 && <li className="chip bg-brand-light text-brand-dark">Market day ready</li>}
        </ul>
      )}
      <Link href="/shop" className="btn btn-ghost mt-4 w-full">
        Open the shop
      </Link>
    </section>
  );
}

/** Pick a streak to commit to (the next three lengths above the current streak). */
export function GoalPicker({ streak, onCommit }: { streak: number; onCommit?: (target: number) => void }) {
  const choices = goalChoices(streak);
  const commit = (t: number) => {
    commitToStreak(t);
    playSfx("tap");
    onCommit?.(t);
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-extrabold text-ink">Commit to a streak goal</p>
      <div className="grid grid-cols-3 gap-2">
        {choices.map((t) => (
          <motion.button
            key={t}
            type="button"
            onClick={() => commit(t)}
            whileTap={{ scale: 0.95 }}
            className="flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 border-line-strong bg-surface px-2 py-2 font-black hover:border-sun"
          >
            <span className="text-lg text-ink tabular-nums">{t} days</span>
            <span className="flex items-center gap-0.5 text-xs text-sun-dark">
              +{GOAL_COINS[t]} <CoinIcon size={14} />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

const MARK_STYLE: Record<DayMark, string> = {
  done: "bg-sun text-white",
  frozen: "bg-brand-light text-brand",
  missed: "border-2 border-dashed border-line-strong text-muted",
  today: "border-2 border-sun text-sun-dark",
  none: "bg-sunk text-muted",
};
const MARK_TEXT: Record<DayMark, string> = { done: "practised", frozen: "covered by a freeze", missed: "missed", today: "not done yet", none: "before you started" };

/** Streak, the last seven days, and the streak goal. */
export function StreakCard({ className = "" }: { className?: string }) {
  const p = useProgress();
  const g = useGame();
  const hid = useId();
  const now = useNow();
  if (!now) return null;
  const today = localDateKey(new Date(now));
  const streak = currentStreak(p, today);
  const week = streakWeek(p, today);
  const goal = g.goal;

  return (
    <section className={`card p-5 ${className}`} aria-labelledby={hid}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={hid} className="text-lg font-black">
          {streak > 0 ? `${streak}-day streak` : "Start a streak"}
        </h2>
        {g.stats.goalsReached > 0 && <span className="text-xs font-bold text-muted">{g.stats.goalsReached} goals reached</span>}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-label="The last seven days">
        {week.map((d, i) => (
          <li key={d.day} className="flex flex-col items-center gap-1">
            <span className="text-[0.7rem] font-extrabold text-muted">{d.label.slice(0, 2)}</span>
            <motion.span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${MARK_STYLE[d.mark]}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 22 }}
              role="img"
              aria-label={`${d.label}: ${MARK_TEXT[d.mark]}`}
            >
              {d.mark === "done" ? <FlameIcon size={16} /> : d.mark === "frozen" ? <FreezeIcon size={16} /> : null}
            </motion.span>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        {goal ? (
          <div>
            <p className="flex items-baseline justify-between text-sm font-extrabold text-ink">
              <span>
                Goal: {goal.target} days
              </span>
              <span className="flex items-center gap-0.5 text-sun-dark">
                +{GOAL_COINS[goal.target]} <CoinIcon size={14} />
              </span>
            </p>
            <span
              className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={`Streak goal: ${streak} of ${goal.target} days`}
              aria-valuemin={0}
              aria-valuemax={goal.target}
              aria-valuenow={Math.min(streak, goal.target)}
            >
              <motion.span
                className="block h-full rounded-full bg-sun"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (streak / goal.target) * 100)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.2 }}
              />
            </span>
            <p className="mt-1 text-xs font-bold text-muted">{Math.max(goal.target - streak, 0)} days to go</p>
          </div>
        ) : streak > 0 ? (
          <GoalPicker streak={streak} />
        ) : (
          <p className="text-sm font-semibold text-muted">Finish a lesson today to start one.</p>
        )}
      </div>
    </section>
  );
}

/** "A freeze kept your streak" banner, shown once after freezes were spent. */
export function FreezeNotice() {
  const g = useGame();
  const n = g.notice?.kind === "freeze-used" ? g.notice.days : 0;
  useEffect(() => {
    if (n) playSfx("freeze");
  }, [n]);
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-brand/30 bg-brand-light px-4 py-3 font-bold text-brand-dark"
          role="status"
        >
          <FreezeIcon size={26} />
          <span className="flex-1">
            {n === 1 ? "A streak freeze covered the day you missed." : `${n} streak freezes covered the days you missed.`} Your streak is safe.
          </span>
          <button type="button" onClick={dismissNotice} className="min-h-11 rounded-xl px-3 font-extrabold hover:bg-surface/60">
            OK
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Coin count for the header. */
export function CoinBadge() {
  const g = useGame();
  const n = coinBalance(g);
  return (
    <span className="hidden items-center gap-1 font-black text-sun-dark min-[420px]:flex" role="img" aria-label={`${n} taka coins`} title={`${n} taka coins`}>
      <CoinIcon />
      <motion.span key={n} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} aria-hidden className="tabular-nums">
        {n}
      </motion.span>
    </span>
  );
}
