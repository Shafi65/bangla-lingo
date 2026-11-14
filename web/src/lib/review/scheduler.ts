// Per-word spaced-review scheduler. Pure functions, no React, no DOM, no deps.
//
// Model: a small FSRS-style ("free spaced repetition") memory model.
// Each word has
//   stability  S  days until recall probability falls to 90 %
//   difficulty D  1 (easy) .. 10 (hard)
// and recall probability after t days is the FSRS power forgetting curve
//   R(t, S) = (1 + F * t / S) ^ C,   F = 19/81, C = -0.5   (so R(S, S) = 0.9).
//
// After each answer (graded again / hard / good / easy):
//   - first answer:  S = INIT_STABILITY[grade],  D = initDifficulty(grade)
//   - correct:       S grows; the growth is larger when D is low, S is small and
//                    R was low (a successful recall of an almost-forgotten word
//                    teaches more than one seen a minute ago). Same-day repeats
//                    (R ~ 1) barely move S.
//   - wrong:         S shrinks to a "post-lapse" value (never above the old S),
//                    lapses += 1, and the word is due again after a short step.
//   - D moves down after easy answers, up after wrong ones, with a little mean
//     reversion so it can't drift to the extremes.
// The next due time is the interval at which R drops to DESIRED_RETENTION.
//
// The weights are the published FSRS-4.5 defaults except the initial
// stabilities, which are shorter: words are first met inside a lesson (often
// several times), and beginners benefit from an early next-day review.
//
// Example cases (DAY = 86_400_000 ms, t0 = any epoch ms):
//   a = schedule(undefined, "good", t0)  -> reps 1, stability 1.5, difficulty 5.16, due = t0 + 1.5 days
//   schedule(a, "good", t0 + 1.5 * DAY)  -> stability ~ 6.2 days (on-time review roughly quadruples it)
//   schedule(a, "good", t0 + 60_000)     -> stability ~ 1.5 (a same-minute repeat adds ~nothing)
//   schedule({ ...a, stability: 10 }, "again", t0 + 10 * DAY)
//                                        -> lapses 1, stability ~ 2.6, run 0, due = now + 10 min
//   retrievability(a, a.lastSeen + a.stability * DAY) -> 0.9

export type Grade = "again" | "hard" | "good" | "easy";

export interface WordRecord {
  /** Lexicon id. */
  id: string;
  /** Number of graded answers. */
  reps: number;
  /** Number of wrong answers. */
  lapses: number;
  /** Days until recall probability drops to 90 %. */
  stability: number;
  /** 1 (easy) .. 10 (hard). */
  difficulty: number;
  /** Epoch ms when the word should next be reviewed. */
  due: number;
  /** Epoch ms of the last graded answer. */
  lastSeen: number;
  /** Epoch ms of the most recent wrong answer, if any. */
  lastWrong?: number;
  /** Consecutive correct answers since the last wrong one. */
  run: number;
}

export const DAY_MS = 86_400_000;
export const DESIRED_RETENTION = 0.9;
/** A wrong answer makes the word due again after this short step. */
export const LAPSE_STEP_MS = 10 * 60_000;
const MAX_STABILITY_DAYS = 365 * 3;
const MIN_STABILITY_DAYS = 0.05;

const F = 19 / 81;
const C = -0.5;

const GRADE_VALUE: Record<Grade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

/** Initial stability (days) by first grade: again, hard, good, easy. */
const INIT_STABILITY = [0.2, 0.6, 1.5, 4] as const;

// FSRS-4.5 default weights w4..w16 (w0..w3 replaced by INIT_STABILITY above).
const W = {
  d0: 5.1618, // w4
  d0k: 1.2298, // w5
  dStep: 0.8975, // w6
  dRevert: 0.031, // w7
  sGrow: 1.6474, // w8
  sDecay: 0.1367, // w9
  rGrow: 1.0461, // w10
  lapse: 2.1072, // w11
  lapseD: 0.0793, // w12
  lapseS: 0.3246, // w13
  lapseR: 1.587, // w14
  hardPenalty: 0.2272, // w15
  easyBonus: 2.8755, // w16
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Recall probability t days after the last review. R(0) = 1, R(S) = 0.9. */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + (F * Math.max(0, elapsedDays)) / stability, C);
}

/** Days until R falls to `retention` (= S when retention is 0.9). */
export function intervalDays(stability: number, retention = DESIRED_RETENTION): number {
  return (stability / F) * (Math.pow(retention, 1 / C) - 1);
}

/** Current recall probability of a record (0..1). Unknown word -> 0. */
export function retrievability(rec: WordRecord | undefined, now: number): number {
  if (!rec) return 0;
  return forgettingCurve((now - rec.lastSeen) / DAY_MS, rec.stability);
}

/** FSRS-4.5: D0(G) = w4 - (G - 3) * w5  (good -> 5.16, again -> 7.62, easy -> 3.93). */
function initDifficulty(g: number): number {
  return clamp(W.d0 - (g - 3) * W.d0k, 1, 10);
}

function nextDifficulty(d: number, g: number): number {
  const moved = d - W.dStep * (g - 3);
  return clamp(W.dRevert * initDifficulty(4) + (1 - W.dRevert) * moved, 1, 10);
}

function successStability(s: number, d: number, r: number, g: number): number {
  const hard = g === 2 ? W.hardPenalty : 1;
  const easy = g === 4 ? W.easyBonus : 1;
  const growth =
    Math.exp(W.sGrow) * (11 - d) * Math.pow(s, -W.sDecay) * (Math.exp(W.rGrow * (1 - r)) - 1) * hard * easy;
  return s * (1 + growth);
}

function lapseStability(s: number, d: number, r: number): number {
  const next =
    W.lapse * Math.pow(d, -W.lapseD) * (Math.pow(s + 1, W.lapseS) - 1) * Math.exp(W.lapseR * (1 - r));
  return Math.min(next, s);
}

/**
 * Apply one graded answer at time `now` (epoch ms) and return the new record.
 * `prev` undefined = first time this word is graded.
 */
export function schedule(prev: WordRecord | undefined, grade: Grade, now: number, id = prev?.id ?? ""): WordRecord {
  const g = GRADE_VALUE[grade];
  const wrong = g === 1;
  let stability: number;
  let difficulty: number;
  if (!prev) {
    stability = INIT_STABILITY[g - 1];
    difficulty = initDifficulty(g);
  } else {
    // Clock went backwards (device time change): treat as "just seen".
    const r = now >= prev.lastSeen ? retrievability(prev, now) : 1;
    difficulty = nextDifficulty(prev.difficulty, g);
    stability = wrong
      ? lapseStability(prev.stability, prev.difficulty, r)
      : successStability(prev.stability, prev.difficulty, r, g);
  }
  stability = clamp(stability, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);
  const due = wrong ? now + LAPSE_STEP_MS : now + Math.round(intervalDays(stability) * DAY_MS);
  const rec: WordRecord = {
    id,
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (wrong ? 1 : 0),
    stability: round3(stability),
    difficulty: round3(difficulty),
    due,
    lastSeen: now,
    run: wrong ? 0 : (prev?.run ?? 0) + 1,
  };
  const lastWrong = wrong ? now : prev?.lastWrong;
  if (lastWrong !== undefined) rec.lastWrong = lastWrong;
  return rec;
}

/** Map a checked answer to a grade. */
export function gradeFor(correct: boolean): Grade {
  return correct ? "good" : "again";
}

export function isDue(rec: WordRecord, now: number): boolean {
  return rec.due <= now;
}

/** 1 weak, 2 fair, 3 good, 4 strong. */
export type Strength = 1 | 2 | 3 | 4;
export const STRENGTH_LABELS: Record<Strength, string> = { 1: "Weak", 2: "Fair", 3: "Good", 4: "Strong" };

/**
 * Four-level strength for the word list. Stability sets the ceiling (how long
 * the memory lasts); a word that is already overdue drops a level, and one that
 * has mostly faded (R < 0.7) counts as weak.
 *   S < 1 day -> 1, < 5 days -> 2, < 21 days -> 3, else 4
 * Examples: fresh record after one "good" (S 1.5) -> 2; S 30 seen yesterday -> 4;
 * S 30 last seen 60 days ago (R ~ 0.8) -> 3; never graded -> 1.
 */
export function strength(rec: WordRecord | undefined, now: number): Strength {
  if (!rec) return 1;
  const s = rec.stability;
  let level: Strength = s < 1 ? 1 : s < 5 ? 2 : s < 21 ? 3 : 4;
  const r = retrievability(rec, now);
  if (r < 0.7) return 1;
  if (r < DESIRED_RETENTION && level > 1) level = (level - 1) as Strength;
  return level;
}

/** Sanitize a record read from storage; undefined if unusable. Never throws. */
export function sanitizeRecord(v: unknown, id: string): WordRecord | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  const stability = num(o.stability);
  const difficulty = num(o.difficulty);
  const due = num(o.due);
  const lastSeen = num(o.lastSeen);
  if (stability === undefined || difficulty === undefined || due === undefined || lastSeen === undefined) {
    return undefined;
  }
  const rec: WordRecord = {
    id,
    reps: Math.max(0, Math.floor(num(o.reps) ?? 1)),
    lapses: Math.max(0, Math.floor(num(o.lapses) ?? 0)),
    stability: clamp(stability, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS),
    difficulty: clamp(difficulty, 1, 10),
    due,
    lastSeen,
    run: Math.max(0, Math.floor(num(o.run) ?? 0)),
  };
  const lw = num(o.lastWrong);
  if (lw !== undefined) rec.lastWrong = lw;
  return rec;
}
