// Game layer: taka coins, streak freezes, daily quests and lifetime counters for badges.
// Pure: no React, no DOM, no clock. Callers pass `today` (local YYYY-MM-DD).
//
// Coins are earned by playing (never bought with money) and spent in the shop (SHOP below).
// Totals are kept as earned / spent / used counters rather than balances, and spending is counted
// per shop item, so two devices can be merged with a per-field max without double-counting
// (see mergeGame).

/** Streak freezes a learner can hold at once. */
export const MAX_FREEZES = 2;
/** Price of one streak freeze, in taka coins. */
export const FREEZE_PRICE = 60;
/** Coins in the chest for finishing all of today's quests. */
export const CHEST_COINS = 15;
/** A free streak freeze every this many streak days. */
export const FREEZE_EVERY = 7;
/** Every this many right answers in a row earns a combo bonus. */
export const COMBO_EVERY = 5;

export const COINS = {
  lesson: 5,
  practice: 3,
  perfect: 5,
  /** Each time a run reaches a multiple of COMBO_EVERY. */
  combo: 2,
} as const;

export type QuestKind = "xp" | "lessons" | "combo" | "typed" | "practice" | "perfect" | "formality" | "bazaar" | "speed";

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
  { id: "speed-1", kind: "speed", target: 1, title: "Play a speed round", href: "/speed" },
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
  /** Coins paid by speed rounds today (capped by SPEED_DAILY_COINS). */
  speedCoins?: number;
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
  goalsReached: number;
  speedRounds: number;
  speedBest: number;
}

/** A streak the learner has committed to reach. */
export interface StreakGoal {
  target: number;
  /** Day it was set. */
  day: string;
  /** Kept (not deleted) once reached, so a sync can't bring it back as open. */
  reached?: true;
  /** Goes up each time a goal is set or reached; the higher one wins a merge. */
  seq: number;
}

/** The goal still to reach, if any. */
export const openGoal = (g: GameState): StreakGoal | null => (g.goal && !g.goal.reached ? g.goal : null);

export interface GameState {
  v: 1;
  coinsEarned: number;
  /** Coins spent, per shop item id (each merged by max, then summed). */
  spent: Record<string, number>;
  /** Freezes ever received (free ones and bought ones). */
  freezesEarned: number;
  freezesUsed: number;
  /** Day a free freeze was last given for a streak milestone (one per day at most). */
  lastFreeFreezeDay: string | null;
  today: DayQuests | null;
  stats: GameStats;
  goal: StreakGoal | null;
  /** Shop items owned (cosmetics). */
  owned: string[];
  /** Equipped streak-lamp colour (a shop item id); null = the default marigold. */
  lamp: string | null;
  /** Epoch ms until which review XP is doubled. */
  boostUntil: number;
  /** Market days bought / used (each doubles the coins of one bazaar visit). */
  marketBought: number;
  marketUsed: number;
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
  goalsReached: 0,
  speedRounds: 0,
  speedBest: 0,
}) as GameStats;

export function emptyGame(): GameState {
  return {
    v: 1,
    coinsEarned: 0,
    spent: {},
    freezesEarned: 0,
    freezesUsed: 0,
    lastFreeFreezeDay: null,
    today: null,
    stats: { ...EMPTY_STATS },
    notice: null,
    goal: null,
    owned: [],
    lamp: null,
    boostUntil: 0,
    marketBought: 0,
    marketUsed: 0,
  };
}

export const coinsSpent = (g: GameState) => Object.values(g.spent).reduce((a, b) => a + b, 0);
export const coinBalance = (g: GameState) => Math.max(0, g.coinsEarned - coinsSpent(g));
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
  return { day: v.day, quests, claimed: v.claimed === true, ...(count(v.speedCoins) ? { speedCoins: count(v.speedCoins) } : {}) };
}

/** Tolerant read of a stored or synced game state; never throws. */
export function sanitizeGame(v: unknown): GameState {
  const g = emptyGame();
  if (!isObj(v) || v.v !== 1) return g;
  g.coinsEarned = count(v.coinsEarned);
  if (isObj(v.spent)) {
    for (const [id, n] of Object.entries(v.spent)) if (SHOP_BY_ID.has(id) && count(n)) g.spent[id] = count(n);
  } else if (Math.min(count(v.coinsSpent), g.coinsEarned)) {
    // Round-1 documents: one total (never more than was earned), and only freezes were for sale.
    g.spent = { freeze: Math.min(count(v.coinsSpent), g.coinsEarned) };
  }
  g.freezesEarned = count(v.freezesEarned);
  g.freezesUsed = Math.min(count(v.freezesUsed), g.freezesEarned);
  g.lastFreeFreezeDay = isDay(v.lastFreeFreezeDay) ? v.lastFreeFreezeDay : null;
  g.today = sanitizeDay(v.today);
  if (isObj(v.stats)) for (const k of Object.keys(EMPTY_STATS) as (keyof GameStats)[]) g.stats[k] = count(v.stats[k]);
  if (isObj(v.goal) && isDay(v.goal.day) && STREAK_GOALS.includes(v.goal.target as number)) {
    g.goal = { target: v.goal.target as number, day: v.goal.day, seq: count(v.goal.seq), ...(v.goal.reached === true ? { reached: true as const } : {}) };
  }
  if (Array.isArray(v.owned)) g.owned = [...new Set(v.owned.filter((id): id is string => typeof id === "string" && SHOP_BY_ID.get(id)?.kind === "lamp"))];
  g.lamp = typeof v.lamp === "string" && g.owned.includes(v.lamp) ? v.lamp : null;
  g.boostUntil = count(v.boostUntil);
  g.marketBought = count(v.marketBought);
  g.marketUsed = Math.min(count(v.marketUsed), g.marketBought);
  if (isObj(v.notice) && v.notice.kind === "freeze-used" && isDay(v.notice.day)) {
    g.notice = { kind: "freeze-used", days: Math.max(1, count(v.notice.days)), day: v.notice.day };
  }
  return g;
}

export const isFreshGame = (g: GameState) =>
  g.coinsEarned === 0 && g.freezesEarned === 0 && !g.today && !g.goal && Object.values(g.stats).every((n) => n === 0);

// ------------------------------------------------------------------ streak goals

/** Streak lengths a learner can commit to, and the coins for reaching each. */
export const STREAK_GOALS: readonly number[] = [7, 14, 30, 50, 100, 200, 365];
export const GOAL_COINS: Readonly<Record<number, number>> = { 7: 10, 14: 20, 30: 40, 50: 60, 100: 100, 200: 150, 365: 250 };

/** The next three goals above the current streak. */
export const goalChoices = (streak: number) => STREAK_GOALS.filter((t) => t > streak).slice(0, 3);

export function setStreakGoal(g: GameState, target: number, today: string): GameState {
  if (!STREAK_GOALS.includes(target)) return g;
  return { ...g, goal: { target, day: today, seq: (g.goal?.seq ?? 0) + 1 } };
}

// ------------------------------------------------------------------ shop

export type ShopKind = "freeze" | "boost" | "market" | "lamp";

export interface ShopItem {
  id: string;
  kind: ShopKind;
  title: string;
  body: string;
  price: number;
  /** For lamps: the CSS colour of the flame. */
  color?: string;
}

/** Minutes of doubled review XP a boost gives. */
export const BOOST_MINUTES = 15;

export const SHOP: readonly ShopItem[] = [
  { id: "freeze", kind: "freeze", title: "Streak freeze", body: "Covers one day you miss. Used by itself.", price: FREEZE_PRICE },
  { id: "boost", kind: "boost", title: "Review boost", body: `Double XP for practice sessions for ${BOOST_MINUTES} minutes.`, price: 40 },
  { id: "market-day", kind: "market", title: "Market day", body: "Your next bazaar visit pays double coins.", price: 30 },
  { id: "lamp-kantha", kind: "lamp", title: "Kantha red lamp", body: "A red streak flame, like kantha thread.", price: 80, color: "var(--color-accent)" },
  { id: "lamp-leaf", kind: "lamp", title: "Banana-leaf lamp", body: "A green streak flame.", price: 80, color: "var(--color-brand)" },
  { id: "lamp-river", kind: "lamp", title: "River lamp", body: "A blue streak flame, for the rivers.", price: 80, color: "#2f80c4" },
];
const SHOP_BY_ID = new Map(SHOP.map((i) => [i.id, i]));
export const shopItem = (id: string) => SHOP_BY_ID.get(id);

export const boostActive = (g: GameState, now: number) => g.boostUntil > now;
export const marketDays = (g: GameState) => Math.max(0, g.marketBought - g.marketUsed);
/** The equipped lamp's flame colour, or undefined for the default. */
export const lampColor = (g: GameState) => (g.lamp ? shopItem(g.lamp)?.color : undefined);

export type ShopResult = { ok: true; state: GameState } | { ok: false; reason: "full" | "coins" | "owned" | "unknown" };

/** Buy one item. `now` = epoch ms (for the boost). */
export function buy(g: GameState, id: string, now: number): ShopResult {
  const item = shopItem(id);
  if (!item) return { ok: false, reason: "unknown" };
  if (item.kind === "freeze" && freezesHeld(g) >= MAX_FREEZES) return { ok: false, reason: "full" };
  if (item.kind === "lamp" && g.owned.includes(id)) return { ok: false, reason: "owned" };
  if (coinBalance(g) < item.price) return { ok: false, reason: "coins" };
  const paid = { ...g, spent: { ...g.spent, [id]: (g.spent[id] ?? 0) + item.price } };
  switch (item.kind) {
    case "freeze":
      return { ok: true, state: { ...paid, freezesEarned: g.freezesEarned + 1 } };
    case "boost":
      // A second boost while one runs extends it.
      return { ok: true, state: { ...paid, boostUntil: Math.max(now, g.boostUntil) + BOOST_MINUTES * 60_000 } };
    case "market":
      return { ok: true, state: { ...paid, marketBought: g.marketBought + 1 } };
    case "lamp":
      return { ok: true, state: { ...paid, owned: [...g.owned, id], lamp: id } };
  }
}

/** Light an owned lamp (or null for the default). */
export function equipLamp(g: GameState, id: string | null): GameState {
  if (id !== null && !g.owned.includes(id)) return g;
  return { ...g, lamp: id };
}

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
  | { type: "bazaar"; saved: number; coins: number }
  | { type: "speed"; score: number };

/** Coins for a speed round: one per 20 points, at most SPEED_MAX_COINS. */
export const SPEED_MAX_COINS = 15;
/** Most coins speed rounds can pay in one day, so replaying them can't outpace lessons. */
export const SPEED_DAILY_COINS = 30;
export const speedCoins = (score: number) => Math.min(SPEED_MAX_COINS, Math.floor(Math.max(0, score) / 20));

export interface EventResult {
  state: GameState;
  /** Coins earned by this event. */
  coins: number;
  /** Quest ids completed by this event. */
  questsDone: string[];
  /** A free streak freeze was given for a streak milestone. */
  freeFreeze: boolean;
  /** A streak goal just reached (its target), or 0. */
  goalReached: number;
  /** A bazaar visit's coins were doubled by a market day. */
  marketDay?: boolean;
  /** A speed round beat the personal best. */
  newBest?: boolean;
  /** A speed round earned less than its score was worth because today's cap was reached. */
  capped?: boolean;
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
  let goalReached = 0;
  let marketDay = false;
  let newBest = false;
  let capped = false;
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
        if (e.combo > 0 && e.combo % COMBO_EVERY === 0) coins += COINS.combo;
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
      const goal = openGoal(g);
      if (goal && e.streak >= goal.target) {
        goalReached = goal.target;
        coins += GOAL_COINS[goalReached] ?? 0;
        stats.goalsReached += 1;
        g = { ...g, goal: { ...goal, reached: true, seq: goal.seq + 1 } };
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
      if (marketDays(g) > 0) {
        coins *= 2;
        marketDay = true;
        g = { ...g, marketUsed: g.marketUsed + 1 };
      }
      track("bazaar", 1);
      break;
    case "speed": {
      const score = Math.max(0, Math.round(e.score));
      stats.speedRounds += 1;
      newBest = score > stats.speedBest;
      stats.speedBest = Math.max(stats.speedBest, score);
      const paidToday = day.speedCoins ?? 0;
      const pay = Math.min(speedCoins(score), Math.max(0, SPEED_DAILY_COINS - paidToday));
      capped = pay < speedCoins(score);
      coins += pay;
      day = { ...day, speedCoins: paidToday + pay };
      track("speed", 1);
      break;
    }
  }

  return {
    state: { ...g, coinsEarned: g.coinsEarned + coins, today: day, stats },
    coins,
    questsDone: done,
    freeFreeze,
    goalReached,
    marketDay,
    newBest,
    capped,
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
    ...(a.speedCoins || b.speedCoins ? { speedCoins: Math.max(a.speedCoins ?? 0, b.speedCoins ?? 0) } : {}),
  };
}

/**
 * The newer of two goal states: higher sequence number (set and reached both raise it), then the
 * later day, then the longer target, so every device picks the same one.
 */
function newerGoal(a: StreakGoal | null, b: StreakGoal | null): StreakGoal | null {
  if (!a || !b) return a ?? b;
  const rank = (g: StreakGoal) => [g.seq, g.day, g.target, g.reached ? 1 : 0] as const;
  const [ra, rb] = [rank(a), rank(b)];
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  return a;
}

/** Merge this device's game state with the server copy (rules in lib/sync/merge.ts). */
export function mergeGame(local: GameState, remote: GameState): GameState {
  const stats = { ...local.stats };
  for (const k of Object.keys(stats) as (keyof GameStats)[]) stats[k] = Math.max(stats[k], remote.stats[k]);
  const coinsEarned = Math.max(local.coinsEarned, remote.coinsEarned);
  const freezesEarned = Math.max(local.freezesEarned, remote.freezesEarned);
  const lastFree = [local.lastFreeFreezeDay, remote.lastFreeFreezeDay].filter(isDay).sort().pop() ?? null;
  const owned = [...new Set([...local.owned, ...remote.owned])];
  // Per-item spending, each the max: a device that bought something the other didn't keeps paying for it.
  const spent: Record<string, number> = { ...local.spent };
  for (const [id, n] of Object.entries(remote.spent)) spent[id] = Math.max(spent[id] ?? 0, n);
  const marketBought = Math.max(local.marketBought, remote.marketBought);
  return {
    v: 1,
    coinsEarned,
    spent,
    freezesEarned,
    freezesUsed: Math.min(Math.max(local.freezesUsed, remote.freezesUsed), freezesEarned),
    lastFreeFreezeDay: lastFree,
    today: mergeDay(local.today, remote.today),
    stats,
    goal: newerGoal(local.goal, remote.goal),
    owned,
    // This device's choice wins, including "back to the default" (null).
    lamp: local.lamp === null || owned.includes(local.lamp) ? local.lamp : remote.lamp,
    boostUntil: Math.max(local.boostUntil, remote.boostUntil),
    marketBought,
    marketUsed: Math.min(Math.max(local.marketUsed, remote.marketUsed), marketBought),
    // A notice is for this device only.
    notice: local.notice,
  };
}
