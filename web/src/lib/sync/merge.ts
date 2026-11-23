// Pure merge rules for account sync. No React, no DOM, no clock: every function is deterministic
// and works on already-sanitized values. Rules (also in docs/ACCOUNTS.md):
//
//   lessons      a lesson completed on either side stays completed; best accuracy, times completed
//                and the latest completion time are each the max; a played record beats a
//                placed/tested-out one; two skip records: a checkpoint test-out beats a placement,
//                otherwise the earlier one is kept
//   XP           max of the two totals (idempotent: syncing twice never double-counts)
//   daily log    per day, the max of the two; trimmed to the 60 days before the latest day
//   last active  the later date
//   streak       recomputed from the union of active days: days in either daily log plus the run of
//                days each side's stored streak vouches for (streak S ending at lastActiveDate L
//                means L-S+1 .. L were all active), counted back from the merged last-active date;
//                frozen days bridge a gap but are not counted
//   frozen days  union of both sides, trimmed like the daily log
//   game         coins and freezes: earned / spent / used totals are each the max; today's quests:
//                the later day wins, same day = per-quest max progress, claimed on either side
//                counts; lifetime counters: each the max
//   word memory  per word, the record with the later lastSeen; tie: more reps, then more lapses,
//                then this device's
//   settings     last writer wins per key, by the per-key change time; tie: this device's
//   onboarding   finished on either side counts as finished; otherwise this device's
//   formality    unlocked tier, best score per tier and rounds played: each the max
//   handwriting  per letter, the better state (written > traced)
//   speaking     per item, the later rating; tie: more ratings, then this device's
//   placement    the more recent test (takenAt); tie: this device's
//
// Convention: `local` is this device, `remote` the server copy. Where a rule needs a tie-break,
// local wins, so merging an unchanged remote copy into local is always a no-op.
import type { LessonRecord, Settings } from "../progress";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../progress";
import type { WordRecord } from "../review/scheduler";
import { cap, MAX_WORDS } from "../review/state";
import type { FormalityStore } from "../formality/types";
import type { WriteProgress } from "../write/storage";
import type { SpeakHistory } from "../speak/history";
import { SPEAK_MAX_ITEMS } from "../speak/history";
import type { StoredPlacement } from "../placement/apply";
import type { OnboardingState } from "../onboarding/storage";
import { mergeGame, type GameState } from "../game/engine";

// --- dates (YYYY-MM-DD local day keys, compared as calendar days) -----------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && DAY_RE.test(s);
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** How many days of daily XP are kept (matches the progress store's own trimming). */
export const DAILY_WINDOW_DAYS = 60;
/** Upper bound on a recomputed streak (guards against absurd stored values). */
export const MAX_STREAK_DAYS = 20_000;

// --- progress --------------------------------------------------------------------------------

/** The part of ProgressState that syncs as user_progress (settings sync separately). */
export interface ProgressCore {
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  completed: Record<string, LessonRecord>;
  daily: Record<string, number>;
  /** Streak-freeze days; absent in documents written before streak freezes. */
  frozen?: string[];
}

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Merge two records for the same lesson (see the rules at the top). */
export function mergeLessonRecord(local: LessonRecord | undefined, remote: LessonRecord | undefined): LessonRecord | undefined {
  if (!local) return remote;
  if (!remote) return local;
  const lPlayed = local.placed !== true;
  const rPlayed = remote.placed !== true;
  if (lPlayed && rPlayed) {
    return {
      completedAt: time(remote.completedAt) > time(local.completedAt) ? remote.completedAt : local.completedAt,
      bestAccuracy: Math.max(local.bestAccuracy || 0, remote.bestAccuracy || 0),
      timesCompleted: Math.max(local.timesCompleted || 0, remote.timesCompleted || 0),
    };
  }
  if (lPlayed) return local;
  if (rPlayed) return remote;
  // Both skipped without playing.
  const lCheck = local.via === "checkpoint";
  const rCheck = remote.via === "checkpoint";
  if (lCheck !== rCheck) return lCheck ? local : remote;
  return time(remote.completedAt) < time(local.completedAt) ? remote : local;
}

export function mergeCompleted(
  local: Record<string, LessonRecord>,
  remote: Record<string, LessonRecord>,
): Record<string, LessonRecord> {
  const out: Record<string, LessonRecord> = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const rec = mergeLessonRecord(local[id], remote[id]);
    if (rec) out[id] = rec;
  }
  return out;
}

const finiteNonNeg = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** Per-day max, trimmed to DAILY_WINDOW_DAYS before `latest` (when given). */
export function mergeDaily(
  local: Record<string, number>,
  remote: Record<string, number>,
  latest?: string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [local, remote]) {
    for (const [k, v] of Object.entries(src)) {
      if (!isDayKey(k)) continue;
      out[k] = Math.max(out[k] ?? 0, finiteNonNeg(v));
    }
  }
  const end = latest && isDayKey(latest) ? dayNumber(latest) : undefined;
  if (end === undefined) return out;
  for (const k of Object.keys(out)) if (end - dayNumber(k) > DAILY_WINDOW_DAYS) delete out[k];
  return out;
}

function laterDay(a: string | null, b: string | null): string | null {
  const okA = isDayKey(a) ? a : null;
  const okB = isDayKey(b) ? b : null;
  if (!okA) return okB;
  if (!okB) return okA;
  return okB > okA ? okB : okA;
}

/**
 * Streak ending at `lastActiveDate`, from the union of active days: keys of the daily logs plus
 * the run each side's stored streak vouches for.
 */
export function recomputeStreak(
  lastActiveDate: string | null,
  dailies: Record<string, number>[],
  claims: { lastActiveDate: string | null; streak: number }[],
  frozen: readonly string[] = [],
): number {
  if (!isDayKey(lastActiveDate)) return 0;
  const days = new Set<number>();
  for (const d of dailies) for (const k of Object.keys(d)) if (isDayKey(k)) days.add(dayNumber(k));
  const frozenDays = new Set(frozen.filter(isDayKey).map(dayNumber));
  // A stored streak S ending at L vouches for S active days counted back from L; frozen days in
  // between are skipped over, not counted.
  const claimed = new Set<number>();
  for (const c of claims) {
    const s = Math.min(Math.floor(finiteNonNeg(c.streak)), MAX_STREAK_DAYS);
    if (!isDayKey(c.lastActiveDate) || s <= 0) continue;
    let left = s;
    for (let d = dayNumber(c.lastActiveDate), steps = 0; left > 0 && steps < MAX_STREAK_DAYS * 2; d--, steps++) {
      if (frozenDays.has(d)) continue;
      claimed.add(d);
      left--;
    }
  }
  // A day logged as active counts even if another device froze it.
  const active = (n: number) => days.has(n) || (!frozenDays.has(n) && claimed.has(n));
  const end = dayNumber(lastActiveDate);
  let run = 0;
  // Walk back from the last active day: active days count, frozen days only bridge the gap.
  for (let d = end, steps = 0; steps < MAX_STREAK_DAYS * 2 && run < MAX_STREAK_DAYS; d--, steps++) {
    if (active(d)) run++;
    else if (!frozenDays.has(d)) break;
  }
  // The last-active day itself always counts (the store sets lastActiveDate only on activity).
  return Math.max(run, 1);
}

/** Union of frozen days, trimmed to DAILY_WINDOW_DAYS before `latest` (when given). */
export function mergeFrozen(local: readonly string[] = [], remote: readonly string[] = [], latest?: string | null): string[] {
  const end = latest && isDayKey(latest) ? dayNumber(latest) : undefined;
  return [...new Set([...local, ...remote].filter(isDayKey))]
    .filter((k) => end === undefined || end - dayNumber(k) <= DAILY_WINDOW_DAYS)
    .sort();
}

export function mergeProgress(local: ProgressCore, remote: ProgressCore): ProgressCore {
  const lastActiveDate = laterDay(local.lastActiveDate, remote.lastActiveDate);
  const daily = mergeDaily(local.daily, remote.daily, lastActiveDate);
  const frozen = mergeFrozen(local.frozen, remote.frozen);
  const out: ProgressCore = {
    xp: Math.max(finiteNonNeg(local.xp), finiteNonNeg(remote.xp)),
    lastActiveDate,
    streak: recomputeStreak(lastActiveDate, [local.daily, remote.daily], [local, remote], frozen),
    completed: mergeCompleted(local.completed, remote.completed),
    daily,
  };
  // Only carry the field when either side has it, so documents without freezes stay unchanged.
  if (local.frozen !== undefined || remote.frozen !== undefined) out.frozen = frozen;
  return out;
}

// --- word memory -----------------------------------------------------------------------------

/** True if `a` should be kept over `b` (same word). */
function preferWord(a: WordRecord, b: WordRecord): boolean {
  if (a.lastSeen !== b.lastSeen) return a.lastSeen > b.lastSeen;
  if (a.reps !== b.reps) return a.reps > b.reps;
  if (a.lapses !== b.lapses) return a.lapses > b.lapses;
  return true; // a is local by convention
}

export function mergeWords(
  local: Record<string, WordRecord>,
  remote: Record<string, WordRecord>,
): Record<string, WordRecord> {
  const words: Record<string, WordRecord> = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const l = words[id];
    if (!l || !preferWord(l, r)) words[id] = r;
  }
  if (Object.keys(words).length <= MAX_WORDS) return words;
  return cap({ version: 1, words, pending: [] }).words;
}

// --- settings and onboarding -----------------------------------------------------------------

export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
/** Epoch ms of the last change per setting; 0 / absent = never changed (default). */
export type SettingStamps = Partial<Record<SettingKey, number>>;

export interface SettingsDoc {
  settings: Settings;
  stamps: SettingStamps;
  onboarding: OnboardingState | null;
}

export function mergeSettings(
  local: { settings: Settings; stamps: SettingStamps },
  remote: { settings: Settings; stamps: SettingStamps },
): { settings: Settings; stamps: SettingStamps } {
  const values: Record<string, unknown> = {};
  const stamps: SettingStamps = {};
  for (const k of SETTING_KEYS) {
    const sl = finiteNonNeg(local.stamps[k]);
    const sr = finiteNonNeg(remote.stamps[k]);
    const useRemote = sr > sl;
    values[k] = useRemote ? remote.settings[k] : local.settings[k];
    const s = Math.max(sl, sr);
    if (s > 0) stamps[k] = s;
  }
  return { settings: sanitizeSettings(values), stamps };
}

export function mergeOnboarding(local: OnboardingState | null, remote: OnboardingState | null): OnboardingState | null {
  if (!local) return remote;
  if (!remote) return local;
  if (remote.completed && !local.completed) return remote;
  return local;
}

export function mergeSettingsDoc(local: SettingsDoc, remote: SettingsDoc): SettingsDoc {
  return { ...mergeSettings(local, remote), onboarding: mergeOnboarding(local.onboarding, remote.onboarding) };
}

// --- practice features -----------------------------------------------------------------------

export function mergeFormality(local: FormalityStore | null, remote: FormalityStore | null): FormalityStore | null {
  if (!local) return remote;
  if (!remote) return local;
  const best: Record<string, number> = { ...local.best };
  for (const [k, v] of Object.entries(remote.best)) best[k] = Math.max(best[k] ?? 0, v);
  return {
    v: 1,
    unlocked: Math.max(local.unlocked, remote.unlocked),
    best,
    rounds: Math.max(local.rounds, remote.rounds),
  };
}

const WRITE_RANK = { traced: 1, written: 2 } as const;

export function mergeWrite(local: WriteProgress | null, remote: WriteProgress | null): WriteProgress | null {
  if (!local) return remote;
  if (!remote) return local;
  const letters = { ...local.letters };
  for (const [id, v] of Object.entries(remote.letters)) {
    const l = letters[id];
    if (!l || WRITE_RANK[v] > WRITE_RANK[l]) letters[id] = v;
  }
  return { version: 1, letters };
}

export function mergeSpeak(local: SpeakHistory | null, remote: SpeakHistory | null): SpeakHistory | null {
  if (!local) return remote;
  if (!remote) return local;
  const out: SpeakHistory = { ...local };
  for (const [k, r] of Object.entries(remote)) {
    const l = out[k];
    if (!l || r.at > l.at || (r.at === l.at && r.n > l.n)) out[k] = r;
  }
  const keys = Object.keys(out);
  if (keys.length > SPEAK_MAX_ITEMS) {
    keys
      .sort((a, b) => out[a].at - out[b].at)
      .slice(0, keys.length - SPEAK_MAX_ITEMS)
      .forEach((k) => delete out[k]);
  }
  return out;
}

export function mergePlacement(local: StoredPlacement | null, remote: StoredPlacement | null): StoredPlacement | null {
  if (!local) return remote;
  if (!remote) return local;
  return time(remote.takenAt) > time(local.takenAt) ? remote : local;
}

export interface FeaturesDoc {
  formality: FormalityStore | null;
  write: WriteProgress | null;
  speak: SpeakHistory | null;
  placement: StoredPlacement | null;
  /** Coins, freezes and quests; absent in documents written before the game layer. */
  game?: GameState | null;
}

export function mergeFeatures(local: FeaturesDoc, remote: FeaturesDoc): FeaturesDoc {
  const out: FeaturesDoc = {
    formality: mergeFormality(local.formality, remote.formality),
    write: mergeWrite(local.write, remote.write),
    speak: mergeSpeak(local.speak, remote.speak),
    placement: mergePlacement(local.placement, remote.placement),
  };
  const lg = local.game ?? null;
  const rg = remote.game ?? null;
  if (lg || rg) out.game = lg && rg ? mergeGame(lg, rg) : (lg ?? rg);
  return out;
}
