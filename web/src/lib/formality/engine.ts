import type { FormalityBank, FormalityResult, FormalityScenario, FormalityStore } from "./types";

/** Seeded PRNG (mulberry32), so rounds are reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const maxTier = (bank: FormalityBank) => Math.max(...bank.tiers.map((t) => t.id));

/** Clamp a stored "unlocked" value to the bank's tiers. */
export const clampTier = (bank: FormalityBank, n: number) =>
  Math.min(Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)), maxTier(bank));

/**
 * Draws a round from tiers 1..unlocked. About half the round comes from the newest unlocked
 * tier (all of it while only tier 1 is open); the rest is spread over the earlier tiers.
 * A round is shorter than `roundSize` only if the bank has too few scenarios.
 */
export function buildRound(bank: FormalityBank, unlocked: number, rand: () => number): FormalityScenario[] {
  const top = clampTier(bank, unlocked);
  const size = bank.roundSize;
  const byTier = new Map<number, FormalityScenario[]>();
  for (const s of bank.scenarios) if (s.tier <= top) byTier.set(s.tier, [...(byTier.get(s.tier) ?? []), s]);

  const newest = shuffle(byTier.get(top) ?? [], rand);
  const older = [...byTier.keys()].filter((t) => t < top).map((t) => shuffle(byTier.get(t)!, rand));
  const wantNewest = older.length ? Math.ceil(size / 2) : size;
  const picked = newest.splice(0, wantNewest);

  // Round-robin over the earlier tiers, then top up from anything left.
  for (let i = 0; picked.length < size && older.some((p) => p.length); i++) {
    const pool = older[i % older.length];
    if (pool.length) picked.push(pool.shift()!);
  }
  while (picked.length < size && newest.length) picked.push(newest.shift()!);
  return shuffle(picked, rand);
}

export const isAccepted = (s: FormalityScenario, chosen: number) => s.answer.includes(chosen);

export const scoreOf = (results: readonly FormalityResult[]) => results.filter((r) => r.correct).length;

/** Newest tier a round included. */
export const roundTier = (round: readonly FormalityScenario[]) => Math.max(1, ...round.map((s) => s.tier));

export function emptyStore(): FormalityStore {
  return { v: 1, unlocked: 1, best: {}, rounds: 0 };
}

/**
 * Store after finishing a round. A score of at least `unlockScore` in a round that included
 * the newest unlocked tier opens the next tier. Returns the new store and the tier it unlocked.
 */
export function finishRound(
  bank: FormalityBank,
  store: FormalityStore,
  round: readonly FormalityScenario[],
  results: readonly FormalityResult[],
): { store: FormalityStore; newlyUnlocked: number | null; bestBefore: number | undefined } {
  const score = scoreOf(results);
  const tier = roundTier(round);
  const key = String(tier);
  const bestBefore = store.best[key];
  const unlockedNow = clampTier(bank, store.unlocked);
  const passes = score >= bank.unlockScore && tier >= unlockedNow && unlockedNow < maxTier(bank);
  const unlocked = passes ? unlockedNow + 1 : unlockedNow;
  return {
    store: {
      v: 1,
      unlocked,
      best: { ...store.best, [key]: Math.max(bestBefore ?? 0, score) },
      rounds: store.rounds + 1,
    },
    newlyUnlocked: passes ? unlocked : null,
    bestBefore,
  };
}
