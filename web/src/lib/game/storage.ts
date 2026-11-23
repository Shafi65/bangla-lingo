// Browser storage for the game layer (coins, freezes, quests) plus the actions the UI calls.
// Signed-in learners sync it through the user_features document (lib/sync/adapters.ts).
import { useSyncExternalStore } from "react";
import { freezePlan, localDateKey, progressStore, type ProgressState } from "../progress";
import {
  applyEvent,
  buyFreeze,
  claimChest,
  clearNotice,
  emptyGame,
  ensureToday,
  freezesHeld,
  sanitizeGame,
  spendFreezes,
  type BuyResult,
  type EventResult,
  type GameEvent,
  type GameState,
} from "./engine";

export const GAME_KEY = "banglalingo.game.v1";

const EMPTY = Object.freeze(emptyGame()) as GameState;
const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined;
let cacheState: GameState = EMPTY;
let memoryOnly: GameState | null = null;

export function readGame(): GameState {
  if (typeof window === "undefined") return EMPTY;
  if (memoryOnly) return memoryOnly;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(GAME_KEY);
  } catch {
    return cacheState;
  }
  if (raw === cacheRaw) return cacheState; // stable snapshot
  cacheRaw = raw;
  try {
    cacheState = raw ? sanitizeGame(JSON.parse(raw)) : EMPTY;
  } catch {
    cacheState = EMPTY;
  }
  return cacheState;
}

export function writeGame(next: GameState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GAME_KEY, JSON.stringify(next));
  } catch {
    memoryOnly = next; // storage full or blocked: keep it for this visit
  }
  listeners.forEach((l) => l());
}

export function subscribeGame(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === GAME_KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive game state; an empty state during SSR and the first hydration. */
export function useGame(): GameState {
  return useSyncExternalStore(subscribeGame, readGame, () => EMPTY);
}

const canPractice = (p: ProgressState) => Object.values(p.completed).some((r) => !r.placed);

/** Make sure today's quests exist (called when a page that shows them mounts). */
export function refreshQuests(today = localDateKey()): GameState {
  const g = readGame();
  const next = ensureToday(g, today, { canPractice: canPractice(progressStore.get()) });
  if (next !== g) writeGame(next);
  return next;
}

/** Record something the learner did. Never throws: the game layer is never essential. */
export function recordGameEvent(e: GameEvent, today = localDateKey()): EventResult | null {
  try {
    const r = applyEvent(readGame(), e, today, { canPractice: canPractice(progressStore.get()) });
    writeGame(r.state);
    return r;
  } catch {
    return null;
  }
}

export function openChest(): number {
  const r = claimChest(readGame());
  if (r.coins) writeGame(r.state);
  return r.coins;
}

export function purchaseFreeze(): BuyResult {
  const r = buyFreeze(readGame());
  if (r.ok) writeGame(r.state);
  return r;
}

/**
 * If the learner missed days and holds enough freezes, spend them so the streak survives. Called
 * when the app opens. Returns how many were used.
 */
export function applyStreakFreezes(today = localDateKey()): number {
  try {
    const g = readGame();
    const days = freezePlan(progressStore.get(), freezesHeld(g), today);
    if (!days.length) return 0;
    progressStore.freezeDays(days);
    writeGame(spendFreezes(g, days.length, today));
    return days.length;
  } catch {
    return 0;
  }
}

export function dismissNotice(): void {
  const g = readGame();
  const next = clearNotice(g);
  if (next !== g) writeGame(next);
}

/** Replace the whole state (account sync). */
export function replaceGame(next: GameState): void {
  writeGame(sanitizeGame(next));
}
