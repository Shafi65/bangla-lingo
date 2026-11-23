// Pure scoring for one visit to a stall. No React, no DOM.
import type { BazaarBank, BazaarStep, Stall } from "./types";

export interface StallResult {
  /** Right answers, one per step. */
  right: boolean[];
  /** What the learner paid. */
  paid: number;
  /** The price before haggling (the start price, or a quantity-adjusted price). */
  asked: number;
  /** asked - paid: what haggling saved. */
  saved: number;
  coins: number;
}

/** Score a finished stall: coins per right step, plus a bonus if a haggle came off. */
export function scoreStall(bank: Pick<BazaarBank, "coinsPerStep" | "haggleBonus">, stall: Stall, right: boolean[]): StallResult {
  let asked = stall.start;
  let paid = stall.start;
  let haggled = false;
  stall.steps.forEach((st: BazaarStep, i) => {
    if (st.kind !== "choose" || st.price === undefined || !right[i]) return;
    if (st.haggle) {
      paid = st.price;
      haggled = true;
    } else {
      asked = st.price;
      paid = st.price;
    }
  });
  const coins = right.filter(Boolean).length * bank.coinsPerStep + (haggled ? bank.haggleBonus : 0);
  return { right, paid, asked, saved: Math.max(0, asked - paid), coins };
}

/** The options of a step in a stable shuffled order (by stall and step), so the answer is not always first. */
export function optionOrder(stallId: string, stepIndex: number, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let h = 2166136261;
  for (const c of `${stallId}:${stepIndex}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;

/** Light structural check of untrusted JSON (the content validator does the full check). */
export function isBazaarBank(v: unknown): v is BazaarBank {
  if (!v || typeof v !== "object") return false;
  const b = v as Partial<BazaarBank>;
  return (
    b.version === 1 &&
    Number.isInteger(b.coinsPerStep) &&
    Number.isInteger(b.haggleBonus) &&
    Array.isArray(b.stalls) &&
    b.stalls.length > 0 &&
    b.stalls.every(
      (s) =>
        typeof s?.id === "string" &&
        Number.isInteger(s.start) &&
        Array.isArray(s.steps) &&
        s.steps.every((st) =>
          st?.kind === "listen"
            ? Array.isArray(st.choices) && Number.isInteger(st.answer) && st.answer < st.choices.length && !!st.say
            : st?.kind === "choose" && Array.isArray(st.options) && Number.isInteger(st.answer) && st.answer < st.options.length,
        ),
    )
  );
}
