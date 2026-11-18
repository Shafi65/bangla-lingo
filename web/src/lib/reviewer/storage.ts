// Reviewer state: what this reviewer decided about each lesson item. Pure functions plus a guarded
// localStorage load/save, so everything here is testable without a browser (pass a Storage-like object).

export const STORAGE_KEY = "banglalingo.reviewer.v1";
export const CORRUPT_KEY = `${STORAGE_KEY}.corrupt`;

export const VERDICTS = ["ok", "needs_change", "unsure"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "OK",
  needs_change: "Needs change",
  unsure: "Unsure",
};

/** One reviewed thing: an exercise (key = exercise id), the tip ("tip") or a vocab row ("vocab:<id>"). */
export interface ItemReview {
  verdict?: Verdict;
  correction: string;
  comment: string;
  /** Hash of the item's content when the verdict was given; a different current hash = changed since review. */
  hash: string;
  /** The Bengali text shown for the item (for the export). */
  text: string;
  /** Position in the lesson (tip, vocab, exercises), for export ordering. */
  seq: number;
  /** ISO timestamp of the last edit. */
  updated: string;
}

export interface LessonOverall {
  /** 1-5 "Overall natural?" */
  rating?: number;
  comment: string;
  updated: string;
}

export interface LessonReview {
  overall?: LessonOverall;
  items: Record<string, ItemReview>;
}

export interface ReviewState {
  version: 1;
  reviewer: string;
  lessons: Record<string, LessonReview>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const emptyState = (): ReviewState => ({ version: 1, reviewer: "", lessons: {} });

const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function parseItem(v: unknown): ItemReview | undefined {
  if (!isRecord(v)) return undefined;
  const verdict = (VERDICTS as readonly unknown[]).includes(v.verdict) ? (v.verdict as Verdict) : undefined;
  const item: ItemReview = {
    ...(verdict ? { verdict } : {}),
    correction: str(v.correction),
    comment: str(v.comment),
    hash: str(v.hash),
    text: str(v.text),
    seq: typeof v.seq === "number" && Number.isFinite(v.seq) ? v.seq : 0,
    updated: str(v.updated),
  };
  return item.verdict || item.comment || item.correction ? item : undefined;
}

function parseOverall(v: unknown): LessonOverall | undefined {
  if (!isRecord(v)) return undefined;
  const r = v.rating;
  const rating = typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 5 ? r : undefined;
  const comment = str(v.comment);
  if (rating === undefined && !comment) return undefined;
  return { ...(rating !== undefined ? { rating } : {}), comment, updated: str(v.updated) };
}

/** Turns anything (parsed JSON of unknown origin) into a valid state; junk is dropped, never thrown on. */
export function parseState(raw: unknown): ReviewState {
  const out = emptyState();
  if (!isRecord(raw)) return out;
  out.reviewer = str(raw.reviewer);
  if (!isRecord(raw.lessons)) return out;
  for (const [lessonId, l] of Object.entries(raw.lessons)) {
    if (BAD_KEYS.has(lessonId) || !isRecord(l)) continue;
    const items: Record<string, ItemReview> = {};
    if (isRecord(l.items)) {
      for (const [key, it] of Object.entries(l.items)) {
        if (BAD_KEYS.has(key)) continue;
        const item = parseItem(it);
        if (item) items[key] = item;
      }
    }
    const overall = parseOverall(l.overall);
    if (Object.keys(items).length || overall) out.lessons[lessonId] = { ...(overall ? { overall } : {}), items };
  }
  return out;
}

/** The browser's localStorage, or null when absent or blocked (SSR, private mode). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Loads the saved state. Missing, unreadable or corrupt data gives an empty state; corrupt text is kept under CORRUPT_KEY. */
export function loadState(storage: StorageLike | null = browserStorage()): ReviewState {
  if (!storage) return emptyState();
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return parseState(JSON.parse(raw));
  } catch {
    try {
      if (raw) storage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* nothing more we can do */
    }
    return emptyState();
  }
}

/** Saves the state; false when the browser refused (quota, private mode). */
export function saveState(state: ReviewState, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Updates (immutable)

export interface ItemMeta {
  hash: string;
  text: string;
  seq: number;
}
export interface ItemPatch {
  /** Present (even as undefined) = the verdict changes; the stored hash is refreshed to the current content. */
  verdict?: Verdict | undefined;
  correction?: string;
  comment?: string;
}

export function updateItem(
  state: ReviewState,
  lessonId: string,
  key: string,
  meta: ItemMeta,
  patch: ItemPatch,
  now: string = new Date().toISOString(),
): ReviewState {
  if (BAD_KEYS.has(lessonId) || BAD_KEYS.has(key)) return state;
  const lesson = state.lessons[lessonId] ?? { items: {} };
  const prev = lesson.items[key];
  const verdictChanges = "verdict" in patch;
  const next: ItemReview = {
    ...(verdictChanges ? (patch.verdict ? { verdict: patch.verdict } : {}) : prev?.verdict ? { verdict: prev.verdict } : {}),
    correction: patch.correction ?? prev?.correction ?? "",
    comment: patch.comment ?? prev?.comment ?? "",
    // Only (re)giving a verdict re-baselines the hash, so editing a comment never hides "changed since your review".
    hash: verdictChanges || !prev ? meta.hash : prev.hash,
    text: meta.text,
    seq: meta.seq,
    updated: now,
  };
  const items = { ...lesson.items };
  if (next.verdict || next.comment || next.correction) items[key] = next;
  else delete items[key];
  return { ...state, lessons: { ...state.lessons, [lessonId]: { ...lesson, items } } };
}

export function updateOverall(
  state: ReviewState,
  lessonId: string,
  patch: { rating?: number | undefined; comment?: string },
  now: string = new Date().toISOString(),
): ReviewState {
  if (BAD_KEYS.has(lessonId)) return state;
  const lesson = state.lessons[lessonId] ?? { items: {} };
  const prev = lesson.overall;
  const rating = "rating" in patch ? patch.rating : prev?.rating;
  const comment = patch.comment ?? prev?.comment ?? "";
  const overall: LessonOverall | undefined =
    rating === undefined && !comment ? undefined : { ...(rating !== undefined ? { rating } : {}), comment, updated: now };
  const next: LessonReview = { items: lesson.items, ...(overall ? { overall } : {}) };
  return { ...state, lessons: { ...state.lessons, [lessonId]: next } };
}

export const setReviewer = (state: ReviewState, reviewer: string): ReviewState => ({ ...state, reviewer });

// ---------------------------------------------------------------------------
// Reading

export type ItemStatus = "none" | "current" | "changed";

/** "changed" = there is a saved review but the item's content hash differs now. */
export function itemStatus(entry: ItemReview | undefined, currentHash: string): ItemStatus {
  if (!entry) return "none";
  return entry.hash === currentHash ? "current" : "changed";
}

/** The verdict that counts: only one given for the content as it is now. */
export function currentVerdict(entry: ItemReview | undefined, currentHash: string): Verdict | undefined {
  return entry && entry.hash === currentHash ? entry.verdict : undefined;
}

export interface LessonProgress {
  total: number;
  reviewed: number;
  ok: number;
  needsChange: number;
  unsure: number;
  /** Items whose content changed since they were reviewed. */
  changed: number;
  comments: number;
  rating?: number;
  status: "unreviewed" | "partial" | "done";
  flagged: boolean;
}

export function lessonProgress(
  state: ReviewState,
  lessonId: string,
  targets: readonly { key: string; hash: string }[],
): LessonProgress {
  const l = state.lessons[lessonId];
  const p: LessonProgress = {
    total: targets.length,
    reviewed: 0,
    ok: 0,
    needsChange: 0,
    unsure: 0,
    changed: 0,
    comments: l?.overall?.comment ? 1 : 0,
    rating: l?.overall?.rating,
    status: "unreviewed",
    flagged: false,
  };
  for (const t of targets) {
    const e = l?.items[t.key];
    if (!e) continue;
    if (e.comment) p.comments++;
    if (e.hash !== t.hash) {
      p.changed++;
      continue;
    }
    if (e.verdict) {
      p.reviewed++;
      if (e.verdict === "ok") p.ok++;
      else if (e.verdict === "needs_change") p.needsChange++;
      else p.unsure++;
    }
  }
  p.status = p.total > 0 && p.reviewed === p.total ? "done" : p.reviewed > 0 ? "partial" : "unreviewed";
  p.flagged = p.needsChange + p.unsure + p.changed > 0;
  return p;
}

// ---------------------------------------------------------------------------
// Merging (import)

const newer = (incoming: string, local: string) => incoming > local;

/** Merges `incoming` into `local`: per item the more recently edited one wins (ties keep local). */
export function mergeStates(local: ReviewState, incoming: ReviewState): { state: ReviewState; taken: number } {
  let taken = 0;
  const lessons: Record<string, LessonReview> = { ...local.lessons };
  for (const [id, inc] of Object.entries(incoming.lessons)) {
    const cur = lessons[id];
    if (!cur) {
      lessons[id] = inc;
      taken += Object.keys(inc.items).length + (inc.overall ? 1 : 0);
      continue;
    }
    const items = { ...cur.items };
    for (const [key, it] of Object.entries(inc.items)) {
      if (!items[key] || newer(it.updated, items[key].updated)) {
        items[key] = it;
        taken++;
      }
    }
    let overall = cur.overall;
    if (inc.overall && (!overall || newer(inc.overall.updated, overall.updated))) {
      overall = inc.overall;
      taken++;
    }
    lessons[id] = { ...(overall ? { overall } : {}), items };
  }
  return { state: { version: 1, reviewer: local.reviewer || incoming.reviewer, lessons }, taken };
}
