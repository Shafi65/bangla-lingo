"use client";

import Link from "next/link";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CoinIcon } from "@/components/icons";
import { CountUp } from "@/components/motion/CountUp";
import { useReviewData } from "@/components/review/useReviewData";
import { celebrate } from "@/lib/celebrate";
import { matchPoints, multiplier, nextWord, SPEED_MIN_WORDS, SPEED_PAIRS, SPEED_SECONDS, speedPool } from "@/lib/game/speed";
import { SPEED_DAILY_COINS } from "@/lib/game/engine";
import { recordGameEvent, useGame } from "@/lib/game/storage";
import { coreMeaning } from "@/lib/review/session";
import type { WordIndex } from "@/lib/review/targets";
import type { ReviewWord } from "@/lib/review/types";
import { playSfx, preloadSfx } from "@/lib/sfx";

type Side = "bn" | "en";

interface Board {
  queue: ReviewWord[];
  cursor: number;
  bn: ReviewWord[];
  en: ReviewWord[];
}

/** Random index below n (only ever called from event handlers). */
const randomIndex = (n: number) => Math.floor(Math.random() * n);

function deal(queue: ReviewWord[]): Board {
  const bn: ReviewWord[] = [];
  let cursor = 0;
  for (let n = 0; n < SPEED_PAIRS; n++) {
    const i = nextWord(queue, cursor, bn);
    if (i < 0) break;
    bn.push(queue[i]);
    cursor = i + 1;
  }
  const en = [...bn];
  for (let i = en.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [en[i], en[j]] = [en[j], en[i]];
  }
  return { queue, cursor, bn, en };
}

/** Sixty seconds to match as many Bengali words to their meanings as you can. */
export function SpeedRound({ words, index }: { words: ReviewWord[]; index: WordIndex }) {
  const { memory, now: mounted, learned } = useReviewData(words, index);
  const game = useGame();
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [board, setBoard] = useState<Board | null>(null);
  const [pick, setPick] = useState<{ side: Side; i: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [endAt, setEndAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [result, setResult] = useState<{ coins: number; best: boolean; capped: boolean } | null>(null);
  const scoreRef = useRef(0);
  const reduce = useReducedMotion();
  /** Result of the last tap pair, for screen readers; `n` changes every time so repeats are read too. */
  const [said, setSaid] = useState<{ n: number; match?: ReviewWord; score: number } | null>(null);
  useEffect(() => preloadSfx(), []);

  const available = mounted ? words.filter((w) => !w.letter && learned.has(w.id)).length : 0;

  const start = () => {
    const queue = speedPool(words, learned, memory.words, Date.now(), Math.random);
    setBoard(deal(queue));
    setPick(null);
    setSaid(null);
    setCombo(0);
    setScore(0);
    scoreRef.current = 0;
    setResult(null);
    setEndAt(Date.now() + SPEED_SECONDS * 1000);
    setClock(Date.now());
    setPhase("play");
  };

  const finish = useCallback(() => {
    setPhase("over");
    const r = recordGameEvent({ type: "speed", score: scoreRef.current });
    setResult({ coins: r?.coins ?? 0, best: !!r?.newBest && scoreRef.current > 0, capped: !!r?.capped });
    playSfx(r?.newBest ? "streak" : "complete");
    if (r?.newBest && scoreRef.current > 0) celebrate("big");
  }, []);

  // The clock: ticks ten times a second while playing.
  useEffect(() => {
    if (phase !== "play") return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setClock(n);
      if (n >= endAt) {
        window.clearInterval(t);
        finish();
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [phase, endAt, finish]);

  const tap = (side: Side, i: number) => {
    if (phase !== "play" || !board) return;
    if (!pick || pick.side === side) {
      setPick(pick?.side === side && pick.i === i ? null : { side, i });
      return;
    }
    const bnI = side === "bn" ? i : pick.i;
    const enI = side === "en" ? i : pick.i;
    setPick(null);
    const w = board.bn[bnI];
    if (w.id !== board.en[enI].id) {
      setCombo(0);
      playSfx("wrong");
      setSaid((x) => ({ n: (x?.n ?? 0) + 1, score: scoreRef.current }));
      if (!reduce) {
        for (const el of document.querySelectorAll(`[data-tile="bn-${bnI}"], [data-tile="en-${enI}"]`)) {
          animate(el, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.35 });
        }
      }
      return;
    }
    const points = matchPoints(combo);
    const nextCombo = combo + 1;
    scoreRef.current += points;
    setScore(scoreRef.current);
    setSaid((x) => ({ n: (x?.n ?? 0) + 1, match: w, score: scoreRef.current }));
    setCombo(nextCombo);
    playSfx(multiplier(nextCombo) > multiplier(combo) ? "combo" : "correct");
    // Replace the matched pair: the new word takes the Bengali slot, its meaning a random
    // English slot (swapped), so new tiles don't give the answer away by position.
    const showing = board.bn.filter((_, k) => k !== bnI);
    const qi = nextWord(board.queue, board.cursor, showing);
    if (qi < 0) return;
    const nw = board.queue[qi];
    const bn = board.bn.map((x, k) => (k === bnI ? nw : x));
    const en = [...board.en];
    const swap = randomIndex(en.length);
    en[enI] = en[swap];
    en[swap] = nw;
    setBoard({ ...board, cursor: qi + 1, bn, en });
  };

  const left = Math.max(0, endAt - clock);

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div key="intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-4">
            <h1 className="text-3xl font-black">Speed round</h1>
            <p className="font-semibold text-muted">
              {SPEED_SECONDS} seconds. Tap a Bengali word, then its meaning. Every 4 in a row raises your multiplier, up to 4×. Words you are close to forgetting come up most.
            </p>
            {game.stats.speedBest > 0 && <p className="font-black text-sun-dark">Your best: {game.stats.speedBest}</p>}
            {mounted && available < SPEED_MIN_WORDS ? (
              <p className="rounded-2xl bg-sunk px-4 py-3 font-bold text-ink">
                Learn a few more words first: you need {SPEED_MIN_WORDS}, you have {available}.{" "}
                <Link href="/" className="text-brand-dark underline">
                  Go to the course
                </Link>
              </p>
            ) : (
              <motion.button type="button" onClick={start} disabled={!mounted} className="btn btn-primary w-full sm:w-60" whileTap={{ scale: 0.96 }}>
                Go!
              </motion.button>
            )}
            <Link href="/practice" className="font-extrabold text-brand-dark underline">
              Back to Practice
            </Link>
          </motion.div>
        )}

        {phase === "play" && board && (
          <motion.div key="play" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-2xl font-black tabular-nums text-ink" aria-live="off">
                {score}
              </span>
              <AnimatePresence>
                {multiplier(combo) > 1 && (
                  <motion.span
                    key={multiplier(combo)}
                    initial={{ scale: 1.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="chip bg-sun text-white"
                  >
                    {multiplier(combo)}×
                  </motion.span>
                )}
              </AnimatePresence>
              <span className={`text-xl font-black tabular-nums ${left < 10_000 ? "text-accent-dark" : "text-muted"}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
                {Math.ceil(left / 1000)}s
              </span>
            </div>
            <p className="sr-only" aria-live="polite">
              {said && (
                <span key={said.n}>
                  {said.match ? (
                    <>
                      Match: <span lang="bn">{said.match.bn}</span>, {coreMeaning(said.match.en)}. {said.score} points
                    </>
                  ) : (
                    "Not a match"
                  )}
                </span>
              )}
            </p>
            <span className="block h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={`block h-full rounded-full ${left < 10_000 ? "bg-accent" : "bg-brand"}`} style={{ width: `${(left / (SPEED_SECONDS * 1000)) * 100}%` }} />
            </span>
            <div className="grid grid-cols-2 gap-3">
              {(["bn", "en"] as const).map((side) => (
                <ul key={side} className="flex flex-col gap-2.5" aria-label={side === "bn" ? "Bengali words" : "Meanings"}>
                  {board[side].map((w, i) => {
                    const picked = pick?.side === side && pick.i === i;
                    return (
                      <li key={`${side}-${i}`}>
                        {/* The button stays put (so keyboard focus survives a match); only its word changes. */}
                        <motion.button
                          data-tile={`${side}-${i}`}
                          type="button"
                          aria-pressed={picked}
                          onClick={() => tap(side, i)}
                          whileTap={{ scale: 0.95 }}
                          className={`flex min-h-16 w-full flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 text-center ${
                            picked ? "border-brand bg-brand-light" : "border-line-strong bg-surface hover:border-brand"
                          }`}
                        >
                          <motion.span
                            key={w.id}
                            className="flex flex-col items-center"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.25 }}
                          >
                            {side === "bn" ? (
                              <>
                                <span lang="bn" className="text-xl font-bold text-ink">
                                  {w.bn}
                                </span>
                                <span className="text-xs font-semibold text-muted">{w.tr}</span>
                              </>
                            ) : (
                              <span className="font-bold text-ink">{coreMeaning(w.en)}</span>
                            )}
                          </motion.span>
                        </motion.button>
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "over" && (
          <motion.div key="over" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 pt-6 text-center">
            <h1 className="text-3xl font-black text-brand-dark">{result?.best ? "New best!" : "Time!"}</h1>
            <p className="text-6xl font-black tabular-nums text-ink">
              <CountUp to={score} delay={0.2} />
            </p>
            <p className="font-bold text-muted">Best: {game.stats.speedBest}</p>
            {!!result?.coins && (
              <p className="flex items-center gap-2 rounded-2xl bg-sun-light px-5 py-3 text-xl font-black text-sun-dark">
                <CoinIcon />
                <span>+{result.coins} taka coins</span>
              </p>
            )}
            {result?.capped && (
              <p className="text-sm font-bold text-muted">Today&apos;s speed-round coins are used up ({SPEED_DAILY_COINS}). Play for fun, or come back tomorrow.</p>
            )}
            <div className="flex w-full max-w-sm flex-col gap-3">
              <button type="button" autoFocus onClick={start} className="btn btn-primary w-full">
                Play again
              </button>
              <Link href="/practice" className="btn btn-ghost w-full">
                Back to Practice
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
