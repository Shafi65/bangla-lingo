// Speed round: match Bengali words to their meanings against the clock. Pure: no React, no DOM.
import { clashes } from "../review/session";
import { retrievability, type WordRecord } from "../review/scheduler";
import type { ReviewWord } from "../review/types";

export const SPEED_SECONDS = 60;
/** Pairs on the board at once. */
export const SPEED_PAIRS = 5;
/** Fewest learned words needed to play. */
export const SPEED_MIN_WORDS = SPEED_PAIRS + 1;
const POOL_SIZE = 30;

/** Points for a match: 10 × the multiplier, which grows by 1 every 4 matches in a row (up to 4×). */
export const multiplier = (combo: number) => Math.min(4, 1 + Math.floor(combo / 4));
export const matchPoints = (combo: number) => 10 * multiplier(combo);

/**
 * Words for a round: learned (non-letter) words, the least remembered first (so due words come up
 * most), then shuffled by `rand` within that pool.
 */
export function speedPool(
  words: readonly ReviewWord[],
  learned: ReadonlySet<string>,
  memory: Readonly<Record<string, WordRecord>>,
  now: number,
  rand: () => number,
): ReviewWord[] {
  const pool = words
    .filter((w) => !w.letter && learned.has(w.id))
    .sort((a, b) => retrievability(memory[a.id], now) - retrievability(memory[b.id], now))
    .slice(0, POOL_SIZE);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * The next word to bring onto the board: the first in `queue` (from `from`) that can't be confused
 * with a word already showing. Returns its queue index, or -1.
 */
export function nextWord(queue: readonly ReviewWord[], from: number, showing: readonly ReviewWord[]): number {
  for (let k = 0; k < queue.length; k++) {
    const i = (from + k) % queue.length;
    if (!showing.some((s) => clashes(s, queue[i]))) return i;
  }
  return -1;
}
