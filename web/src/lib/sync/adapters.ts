// Adapters between the local stores and the four server documents. Each adapter reads the current
// local value, writes a merged one back through the store's own API (so React subscribers update),
// and reports local changes. The stores stay the source of truth; nothing here is needed to use
// the app offline or signed out.
import { DEFAULT_SETTINGS, progressStore, type ProgressStore, type Settings } from "../progress";
import type { WordRecord } from "../review/scheduler";
import { readStore as readFormality, subscribeStore as subscribeFormality, writeStore as writeFormality } from "../formality/storage";
import { readWriteProgress, replaceWriteProgress, subscribeWrite } from "../write/storage";
import { readSpeakHistory, replaceSpeakHistory, subscribeSpeak } from "../speak/history";
import { readStoredPlacement, writeStoredPlacement } from "../placement/apply";
import { readOnboarding, subscribeOnboarding, writeOnboarding } from "../onboarding/storage";
import { emptyStore as emptyFormality } from "../formality/engine";
import { isFreshGame } from "../game/engine";
import { readGame, replaceGame, subscribeGame } from "../game/storage";
import {
  encodeWords,
  parseFeaturesDoc,
  parseMemoryDoc,
  parseProgressDoc,
  parseSettingsDoc,
  sanitizeStamps,
  stableStringify,
} from "./codec";
import {
  mergeFeatures,
  mergeProgress,
  mergeSettingsDoc,
  mergeWords,
  SETTING_KEYS,
  type FeaturesDoc,
  type ProgressCore,
  type SettingStamps,
  type SettingsDoc,
} from "./merge";

export type SyncTable = "user_progress" | "user_memory" | "user_settings" | "user_features";

export interface DocAdapter<T = unknown> {
  table: SyncTable;
  /** The current local value. */
  read(): T;
  /** Apply a merged value locally. */
  write(next: T): void;
  /** Server form of a value (JSON-safe). */
  encode(v: T): unknown;
  /** Parse an untrusted server document; null when unusable. */
  parse(data: unknown): T | null;
  merge(local: T, remote: T): T;
  /** Local changes. */
  subscribe(cb: () => void): () => void;
}

// --- user_progress -----------------------------------------------------------------------------

export function progressAdapter(store: ProgressStore = progressStore): DocAdapter<ProgressCore> {
  return {
    table: "user_progress",
    read() {
      const { xp, streak, lastActiveDate, completed, daily, frozen } = store.get();
      return { xp, streak, lastActiveDate, completed, daily, ...(frozen.length ? { frozen } : {}) };
    },
    write(next) {
      store.replaceProgress(next);
    },
    encode: (v) => v,
    parse: parseProgressDoc,
    merge: mergeProgress,
    subscribe: (cb) => store.subscribe(cb),
  };
}

// --- user_memory -------------------------------------------------------------------------------

export function memoryAdapter(store: ProgressStore = progressStore): DocAdapter<Record<string, WordRecord>> {
  return {
    table: "user_memory",
    read: () => store.getWordMemory().words,
    // Pending (not yet mapped) answers stay on this device; only the word records sync.
    write(next) {
      store.updateWordMemory((prev) => ({ ...prev, words: next }));
    },
    encode: encodeWords,
    parse: parseMemoryDoc,
    merge: mergeWords,
    subscribe: (cb) => store.subscribe(cb),
  };
}

// --- user_settings -----------------------------------------------------------------------------
// Settings carry no change times of their own, so the adapter keeps them here: the last settings it
// saw and, per key, when that key last changed. A key that differs from the snapshot is stamped
// with the current time. On a device with no snapshot yet, keys still at their default count as
// never changed (stamp 0), so an account's earlier choices win over a fresh device's defaults.

export const SYNC_META_KEY = "banglalingo.sync.v1";

interface SettingsMeta {
  snapshot: Settings | null;
  stamps: SettingStamps;
}

function readMeta(): SettingsMeta {
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY);
    const v = raw ? (JSON.parse(raw) as { snapshot?: unknown; stamps?: unknown }) : null;
    return {
      snapshot: v?.snapshot && typeof v.snapshot === "object" ? (v.snapshot as Settings) : null,
      stamps: sanitizeStamps(v?.stamps),
    };
  } catch {
    return { snapshot: null, stamps: {} };
  }
}

function writeMeta(m: SettingsMeta) {
  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(m));
  } catch {
    // storage blocked: stamps fall back to "now" next time
  }
}

export function clearSyncMeta() {
  try {
    window.localStorage.removeItem(SYNC_META_KEY);
  } catch {
    // nothing to clear
  }
}

/** Stamp settings keys that changed since the last snapshot; pure. */
export function restamp(meta: SettingsMeta, current: Settings, now: number): SettingsMeta {
  const stamps = { ...meta.stamps };
  for (const k of SETTING_KEYS) {
    const before = meta.snapshot ? meta.snapshot[k] : DEFAULT_SETTINGS[k];
    if (current[k] !== before) stamps[k] = now;
  }
  return { snapshot: { ...current }, stamps };
}

export function settingsAdapter(store: ProgressStore = progressStore, now: () => number = Date.now): DocAdapter<SettingsDoc> {
  const refresh = (): SettingsMeta => {
    const meta = readMeta();
    const next = restamp(meta, store.get().settings, now());
    if (stableStringify(next) !== stableStringify(meta)) writeMeta(next);
    return next;
  };
  return {
    table: "user_settings",
    read() {
      const meta = refresh();
      return { settings: store.get().settings, stamps: meta.stamps, onboarding: readOnboarding() };
    },
    write(next) {
      const cur = store.get().settings;
      if (stableStringify(cur) !== stableStringify(next.settings)) store.updateSettings(next.settings);
      writeMeta({ snapshot: { ...store.get().settings }, stamps: next.stamps });
      const ob = readOnboarding();
      if (next.onboarding && stableStringify(ob) !== stableStringify(next.onboarding)) {
        const { version: _v, ...rest } = next.onboarding;
        void _v;
        writeOnboarding(rest);
      }
    },
    encode: (v) => v,
    parse: parseSettingsDoc,
    merge: mergeSettingsDoc,
    subscribe(cb) {
      const onChange = () => {
        refresh();
        cb();
      };
      const a = store.subscribe(onChange);
      const b = subscribeOnboarding(cb);
      return () => {
        a();
        b();
      };
    },
  };
}

// --- user_features -----------------------------------------------------------------------------

export function featuresAdapter(): DocAdapter<FeaturesDoc> {
  return {
    table: "user_features",
    read() {
      const formality = readFormality();
      const write = readWriteProgress();
      const speak = readSpeakHistory();
      const isFreshFormality = stableStringify(formality) === stableStringify(emptyFormality());
      const game = readGame();
      return {
        formality: isFreshFormality ? null : formality,
        write: Object.keys(write.letters).length ? write : null,
        speak: Object.keys(speak).length ? speak : null,
        placement: readStoredPlacement(),
        ...(isFreshGame(game) ? {} : { game }),
      };
    },
    write(next) {
      const cur = this.read();
      if (next.formality && stableStringify(next.formality) !== stableStringify(cur.formality)) writeFormality(next.formality);
      if (next.write && stableStringify(next.write) !== stableStringify(cur.write)) replaceWriteProgress(next.write);
      if (next.speak && stableStringify(next.speak) !== stableStringify(cur.speak)) replaceSpeakHistory(next.speak);
      if (next.placement && stableStringify(next.placement) !== stableStringify(cur.placement)) writeStoredPlacement(next.placement);
      if (next.game && stableStringify(next.game) !== stableStringify(cur.game ?? null)) replaceGame(next.game);
    },
    // The one-off "a freeze saved your streak" notice stays on this device.
    encode: (v) => (v.game ? { ...v, game: { ...v.game, notice: null } } : v),
    parse: parseFeaturesDoc,
    merge: mergeFeatures,
    subscribe(cb) {
      // The placement result has no listeners of its own; applying it always marks lessons in the
      // progress store, which is watched by the progress adapter (every change syncs every document).
      const offs = [subscribeFormality(cb), subscribeWrite(cb), subscribeSpeak(cb), subscribeGame(cb)];
      return () => offs.forEach((off) => off());
    },
  };
}

export function defaultAdapters(): DocAdapter[] {
  return [progressAdapter(), memoryAdapter(), settingsAdapter(), featuresAdapter()] as DocAdapter[];
}
