"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { ChestIcon, CoinIcon, FreezeIcon } from "@/components/icons";
import { celebrate, originOf } from "@/lib/celebrate";
import {
  CHEST_COINS,
  chestReady,
  coinBalance,
  FREEZE_EVERY,
  FREEZE_PRICE,
  freezesHeld,
  MAX_FREEZES,
  questDef,
  questDone,
} from "@/lib/game/engine";
import { dismissNotice, openChest, purchaseFreeze, refreshQuests, useGame } from "@/lib/game/storage";
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

/** Coin balance and streak freezes, with the freeze shop. */
export function WalletCard({ className = "" }: { className?: string }) {
  const g = useGame();
  const hid = useId();
  const [msg, setMsg] = useState<string | null>(null);
  const balance = coinBalance(g);
  const held = freezesHeld(g);
  const canBuy = held < MAX_FREEZES && balance >= FREEZE_PRICE;

  const buy = () => {
    const r = purchaseFreeze();
    if (r.ok) {
      playSfx("freeze");
      setMsg("Streak freeze ready. It is used by itself if you miss a day.");
    } else setMsg(r.reason === "full" ? `You can hold ${MAX_FREEZES} at a time.` : `You need ${FREEZE_PRICE} coins.`);
  };

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
      <p className="mt-3 text-sm font-semibold text-muted">
        A streak freeze covers a day you miss. You get one free every {FREEZE_EVERY} days of streak.
      </p>
      <motion.button
        type="button"
        onClick={buy}
        disabled={!canBuy}
        className="btn btn-ghost mt-3 w-full"
        whileTap={canBuy ? { scale: 0.96 } : undefined}
      >
        <FreezeIcon size={20} /> Buy · {FREEZE_PRICE} <CoinIcon size={18} />
        <span className="sr-only">taka coins for one streak freeze</span>
      </motion.button>
      {msg && (
        <p className="mt-2 text-sm font-bold text-brand-dark" role="status">
          {msg}
        </p>
      )}
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
