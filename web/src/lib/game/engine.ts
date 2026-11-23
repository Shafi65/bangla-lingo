// Game layer: taka coins, streak freezes, daily quests and lifetime counters for badges.
// Pure: no React, no DOM, no clock. Callers pass `today` (local YYYY-MM-DD).
//
// Coins are earned by playing (never bought with money) and spent only on streak freezes.
// Totals are kept as earned / spent / used counters rather than balances, so two devices can be
// merged with a per-field max without ever double-counting (see mergeGame).

export const GAME_VERSION = 1;
/** Streak freezes a learner can hold at once. */
export const MAX_FREEZES = 2;
/** Price of one streak freeze, in taka coins. */
export const FREEZE_PRICE = 60;
/** Coins in the chest for finishing all of today's quests. */
export const CHEST_COINS = 15;
/** A free streak freeze every this many streak days. */
export const FREEZE_EVERY = 7;
/** Every this many right answers in a row earns a combo bonus. */
export const COMBO_BONUS_FROM = 5;

export const COINS = {
  lesson: 5,
  practice: 3,
  perfect: 5,
  /** Per COMBO_BONUS_FROM answers in a row. */
  combo: 2,
} as const;

export type QuestKind = "xp" | "lessons" | "combo" | "typed" | "practice" | "perfect" | "formality" | "bazaar";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  target: number;
  title: string;
  /** Where to go to work on it. */
  href: string;
}

export const QUEST_POOL: readonly QuestDef[] = [
  { id: "xp-20", kind: "xp", target: 20, title: "Earn 20 XP", href: "/" },
  { id: "xp-40", kind: "xp", target: 40, title: "Earn 40 XP", href: "/" },
  { id: "lessons-1", kind: "lessons", target: 1, title: "Finish a lesson", href: "/" },
  { id: "lessons-2", kind: "lessons", target: 2, title: "Finish 2 lessons", href: "/" },
  { id: "combo-5", kind: "combo", target: 5, title: "Get 5 answers right in a row", href: "/" },
  { id: "combo-8", kind: "combo", target: 8, title: "Get 8 answers right in a row", href: "/" },
  { id: "typed-3", kind: "typed", target: 3, title: "Type 3 answers correctly", href: "/" },
  { id: "practice-1", kind: "practice", target: 1, title: "Finish a practice session", href: "/practice" },
  { id: "perfect-1", kind: "perfect", target: 1, title: "Finish a lesson with no mistakes", href: "/" },
  { id: "formality-1", kind: "formality", target: 1, title: "Play a formality round", href: "/formality" },
  { id: "bazaar-1", kind: "bazaar", target: 1, title: "Haggle at the bazaar", href: "/bazaar" },
];

const QUEST_BY_ID = new Map(QUEST_POOL.map((q) => [q.id, q]));
export const questDef = (id: string): QuestDef | undefined => QUEST_BY_ID.get(id);

export interface QuestProgress {
  id: string;
  progress: number;
}

export interface DayQuests {
  day: string;
  quests: QuestProgress[];
  claimed: boolean;
}

/** Lifetime counters (for badges and the profile). */
export interface GameStats {
  bestCombo: number;
  perfectLessons: number;
  typedCorrect: number;
  chests: number;
  freezesSaved: number;
  bazaarRounds: number;
  bazaarSaved: number;
  formalityRounds: number;
}

export interface GameState {
  v: 1;
  coinsEarned: number;
  coinsSpent: number;
  /** Freezes ever received (free ones and bought ones). */
  freezesEarned: number;
  freezesUsed: number;
  /** Day a free freeze was last given for a streak milestone (one per day at most). */
  lastFreeFreezeDay: string | null;
  today: DayQuests | null;
  stats: GameStats;
  /** Set when a freeze has just saved the streak; shown once, then cleared. */
  notice: { kind: "freeze-used"; days: number; day: string } | null;
}

export const EMPTY_STATS: GameStats = Object.freeze({
  bestCombo: 0,
  perfectLessons: 0,
  typedCorrect: 0,
  chests: 0,
  freezesSaved: 0,
  bazaarRounds: 0,
  bazaarSaved: 0,
  formalityRounds: 0,
}) as GameStats;

export function emptyGame(): GameState {
  return {
    v: 1,
    coinsEarned: 0,
    coinsSpent: 0,
    freezesEarned: 0,
    freezesUsed: 0,
    lastFreeFreezeDay: null,
    today: null,
    stats: { ...EMPTY_STATS },
    notice: null,
  };
}

export const coinBalance = (g: GameState) => Math.max(0, g.coinsEarned - g.coinsSpent);
export const freezesHeld = (g: GameState) => Math.max(0, Math.min(MAX_FREEZES, g.freezesEarned - g.freezesUsed));

// ------------------------------------------------------------------ sanitizing

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeDay(v: unknown): DayQuests | null {
  if (!isObj(v) || !isDay(v.day) || !Array.isArray(v.quests)) return null;
  const seen = new Set<string>();
  const quests: QuestProgress[] = [];
  for (const q of v.quests) {
    if (!isObj(q) || typeof q.id !== "string" || !QUEST_BY_ID.has(q.id) || seen.has(q.id)) continue;
    seen.add(q.id);
    quests.push({ id: q.id, progress: Math.min(count(q.progress), QUEST_BY_ID.get(q.id)!.target) });
  }
  if (!quests.length) return null;
  return { day: v.day, quests, claimed: v.claimed === true };
}

/** Tolerant read of a stored or synced game state; never throws. */
export function sanitizeGame(v: unknown): GameState {
  const g = emptyGame();
  if (!isObj(v) || v.v !== 1) return g;
  g.coinsEarned = count(v.coinsEarned);
  g.coinsSpent = Math.min(count(v.coinsSpent), g.coinsEarned);
  g.freezesEarned = count(v.freezesEarned);
  g.freezesUsed = Math.min(count(v.freezesUsed), g.freezesEarned);
  g.lastFreeFreezeDay = isDay(v.lastFreeFreezeDay) ? v.lastFreeFreezeDay : null;
  g.today = sanitizeDay(v.today);
  if (isObj(v.stats)) for (const k of Object.keys(EMPTY_STATS) as (keyof GameStats)[]) g.stats[k] = count(v.stats[k]);
  if (isObj(v.notice) && v.notice.kind === "freeze-used" && isDay(v.notice.day)) {
    g.notice = { kind: "freeze-used", days: Math.max(1, count(v.notice.days)), day: v.notice.day };
  }
  return g;
}

export const isFreshGame = (g: GameState) =>
  g.coinsEarned === 0 && g.freezesEarned === 0 && !g.today && Object.values(g.stats).every((n) => n === 0);

// ------------------------------------------------------------------ daily quests

/** Small deterministic hash of a string (FNV-1a). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Today's three quests: always one about XP or lessons, then two others of different kinds, picked
 * by the date so every device shows the same set. `canPractice` = the learner has finished a lesson
 * (Practice needs one); without it practice quests are left out.
 */
export function questsForDay(day: string, opts: { canPractice: boolean }): QuestDef[] {
  const pool = QUEST_POOL.filter((q) => opts.canPractice || q.kind !== "practice");
  const first = pool.filter((q) => q.kind === "xp" || q.kind === "lessons");
  const rest = pool.filter((q) => q.kind !== "xp" && q.kind !== "lessons");
  const pick: QuestDef[] = [first[hash(`${day}:a`) % first.length]];
  const order = [...rest].sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`));
  for (const q of order) {
    if (pick.length >= 3) break;
    if (pick.some((p) => p.kind === q.kind)) continue;
    pick.push(q);
  }
  return pick;
}

/** The state with today's quests in place (fresh ones if the stored day is older). */
export function ensureToday(g: GameState, today: string, opts: { canPractice: boolean }): GameState {
  if (g.today?.day === today) return g;
  return {
    ...g,
    today: { day: today, quests: questsForDay(today, opts).map((q) => ({ id: q.id, progress: 0 })), claimed: false },
  };
}

export const questDone = (q: QuestProgress) => q.progress >= (questDef(q.id)?.target ?? Infinity);
export const allQuestsDone = (d: DayQuests | null) => !!d && d.quests.length > 0 && d.quests.every(questDone);
export const chestReady = (d: DayQuests | null) => allQuestsDone(d) && !d!.claimed;

// ------------------------------------------------------------------ events

export type GameEvent =
  /** One checked answer in a lesson or practice run. `combo` = right answers in a row so far. */
  | { type: "answer"; correct: boolean; typed: boolean; combo: number }
  /** A lesson (or practice session) finished. */
  | { type: "lesson"; mode: "lesson" | "practice"; xp: number; perfect: boolean; streak: number }
  | { type: "formality"; score: number }
  | { type: "bazaar"; saved: number; coins: number };

export interface EventResult {
  state: GameState;
  /** Coins earned by this event. */
  coins: number;
  /** Quest ids completed by this event. */
  questsDone: string[];
  /** A free streak freeze was given for a streak milestone. */
  freeFreeze: boolean;
}

function bump(d: DayQuests, kind: QuestKind, by: number, absolute = false): { day: DayQuests; done: string[] } {
  const done: string[] = [];
  const quests = d.quests.map((q) => {
    const def = questDef(q.id);
    if (!def || def.kind !== kind) return q;
    const before = q.progress;
    const progress = Math.min(def.target, absolute ? Math.max(before, by) : before + by);
    if (before < def.target && progress >= def.target) done.push(q.id);
    return progress === before ? q : { ...q, progress };
  });
  return { day: { ...d, quests }, done };
}

/** Apply one event: coins, quest progress, counters and free freezes. */
export function applyEvent(g0: GameState, e: GameEvent, today: string, opts: { canPractice: boolean }): EventResult {
  let g = ensureToday(g0, today, opts);
  let day = g.today!;
  let coins = 0;
  const done: string[] = [];
  const stats = { ...g.stats };
  let freeFreeze = false;
  const track = (kind: QuestKind, by: number, absolute = false) => {
    const r = bump(day, kind, by, absolute);
    day = r.day;
    done.push(...r.done);
  };

  switch (e.type) {
    case "answer":
      if (e.correct) {
        stats.bestCombo = Math.max(stats.bestCombo, e.combo);
        track("combo", e.combo, true);
        if (e.combo > 0 && e.combo % COMBO_BONUS_FROM === 0) coins += COINS.combo;
        if (e.typed) {
          stats.typedCorrect += 1;
          track("typed", 1);
        }
      }
      break;
    case "lesson":
      coins += e.mode === "lesson" ? COINS.lesson : COINS.practice;
      track("xp", Math.max(0, Math.round(e.xp)));
      if (e.mode === "lesson") track("lessons", 1);
      else track("practice", 1);
      if (e.perfect && e.mode === "lesson") {
        coins += COINS.perfect;
        stats.perfectLessons += 1;
        track("perfect", 1);
      }
      // A free freeze for every FREEZE_EVERY streak days, while there is room to hold it.
      if (e.streak > 0 && e.streak % FREEZE_EVERY === 0 && g.lastFreeFreezeDay !== today && freezesHeld(g) < MAX_FREEZES) {
        g = { ...g, freezesEarned: g.freezesEarned + 1, lastFreeFreezeDay: today };
        freeFreeze = true;
      }
      break;
    case "formality":
      stats.formalityRounds += 1;
      track("formality", 1);
      break;
    case "bazaar":
      stats.bazaarRounds += 1;
      stats.bazaarSaved += Math.max(0, Math.round(e.saved));
      coins += Math.max(0, Math.round(e.coins));
      track("bazaar", 1);
      break;
  }

  return {
    state: { ...g, coinsEarned: g.coinsEarned + coins, today: day, stats },
    coins,
    questsDone: done,
    freeFreeze,
  };
}

/** Open today's chest once every quest is done. */
export function claimChest(g: GameState): { state: GameState; coins: number } {
  if (!chestReady(g.today)) return { state: g, coins: 0 };
  return {
    state: {
      ...g,
      coinsEarned: g.coinsEarned + CHEST_COINS,
      today: { ...g.today!, claimed: true },
      stats: { ...g.stats, chests: g.stats.chests + 1 },
    },
    coins: CHEST_COINS,
  };
}

export type BuyResult = { ok: true; state: GameState } | { ok: false; reason: "full" | "coins" };

/** Spend FREEZE_PRICE coins on one streak freeze. */
export function buyFreeze(g: GameState): BuyResult {
  if (freezesHeld(g) >= MAX_FREEZES) return { ok: false, reason: "full" };
  if (coinBalance(g) < FREEZE_PRICE) return { ok: false, reason: "coins" };
  return {
    ok: true,
    state: { ...g, coinsSpent: g.coinsSpent + FREEZE_PRICE, freezesEarned: g.freezesEarned + 1 },
  };
}

/** Record that `days` freezes were used to cover missed days. */
export function spendFreezes(g: GameState, days: number, today: string): GameState {
  const n = Math.min(Math.max(0, Math.floor(days)), freezesHeld(g));
  if (!n) return g;
  return {
    ...g,
    freezesUsed: g.freezesUsed + n,
    stats: { ...g.stats, freezesSaved: g.stats.freezesSaved + n },
    notice: { kind: "freeze-used", days: n, day: today },
  };
}

export const clearNotice = (g: GameState): GameState => (g.notice ? { ...g, notice: null } : g);

// ------------------------------------------------------------------ sync merge

function mergeDay(a: DayQuests | null, b: DayQuests | null): DayQuests | null {
  if (!a) return b;
  if (!b) return a;
  if (a.day !== b.day) return b.day > a.day ? b : a;
  const byId = new Map(b.quests.map((q) => [q.id, q.progress]));
  return {
    day: a.day,
    quests: a.quests.map((q) => ({ id: q.id, progress: Math.max(q.progress, byId.get(q.id) ?? 0) })),
    claimed: a.claimed || b.claimed,
  };
}

/** Merge this device's game state with the server copy (rules in lib/sync/merge.ts). */
export function mergeGame(local: GameState, remote: GameState): GameState {
  const stats = { ...local.stats };
  for (const k of Object.keys(stats) as (keyof GameStats)[]) stats[k] = Math.max(stats[k], remote.stats[k]);
  const coinsEarned = Math.max(local.coinsEarned, remote.coinsEarned);
  const freezesEarned = Math.max(local.freezesEarned, remote.freezesEarned);
  const lastFree = [local.lastFreeFreezeDay, remote.lastFreeFreezeDay].filter(isDay).sort().pop() ?? null;
  return {
    v: 1,
    coinsEarned,
    coinsSpent: Math.min(Math.max(local.coinsSpent, remote.coinsSpent), coinsEarned),
    freezesEarned,
    freezesUsed: Math.min(Math.max(local.freezesUsed, remote.freezesUsed), freezesEarned),
    lastFreeFreezeDay: lastFree,
    today: mergeDay(local.today, remote.today),
    stats,
    // A notice is for this device only.
    notice: local.notice,
  };
}
